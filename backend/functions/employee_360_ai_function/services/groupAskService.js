'use strict';

const crypto = require('crypto');
const AskService = require('./askService');
const Employee360Service = require('./employee360Service');
const AskGenerator = require('../ai/askGenerator');
const QuestionRouter = require('../ai/questionRouter');
const OrganizationAnswers = require('../ai/organizationAnswers');
const GroupAnswers = require('../ai/groupAnswers');
const AccessScope = require('../middleware/accessScope');
const ZohoPeopleEmployeeService = require('../connectors/zohoPeople/zohoPeopleEmployeeService');
const AIInteractionRepository = require('../repositories/aiInteractionRepository');
const Environment = require('../config/environment');
const { DATA_CLASSIFICATION, CONFIDENCE_LEVELS } = require('../config/constants');
const Logger = require('../utils/logger');

const { ROUTES } = QuestionRouter;
const GROUP_ROUTE = 'group';

// Live group answers build one Employee 360 per member (~0.7 s each on
// Development); four at a time keeps a full group inside the Web Tab timeout.
const BUILD_CONCURRENCY = 4;
const MAX_GROUP_RECORDS = 25;

const NO_VERIFIED_SELF_REPLY =
  "Sign-in isn't verified in this environment, so I can't tell who \"you\" are. Mention a person with @ to ask about them.";
const UNMATCHED_SELF_REPLY =
  "I couldn't match your sign-in to a single employee record in Zoho People, so I can't answer questions about you.";

const MY_TEAM = /\bmy (team|reportees|direct reports|reports|people)\b/;
const MY_DEPARTMENT = /\bmy department\b/;

function unknown(answer, route, limitations = []) {
  return {
    answer,
    type: DATA_CLASSIFICATION.UNKNOWN,
    confidence: CONFIDENCE_LEVELS.UNKNOWN,
    evidence: [],
    limitations,
    route
  };
}

async function mapWithLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * POST /v1/ask: chat questions that are not tied to one selected employee.
 * Order: authorize every mention against the caller's scope, then
 * - one person (mentioned, or the asker for "my …" questions): the existing
 *   single-employee pipeline, unchanged;
 * - otherwise a group (whole scope, @all, #department, several people):
 *   deterministic directory/metric answers first, then grounded group AI.
 */
class GroupAskService {
  constructor() {
    this.askService = new AskService();
    this.employee360Service = new Employee360Service();
    this.askGenerator = new AskGenerator();
    this.directoryService = new ZohoPeopleEmployeeService();
    this.aiInteractionRepository = new AIInteractionRepository();
  }

  /** The question as plain text: "@Priya Nair" → "Priya Nair", "#HR" → "HR". */
  static plainQuestion(question) {
    return String(question || '').replace(/(^|\s)[@#](?=\S)/g, '$1').replace(/\s+/g, ' ').trim();
  }

  async ask(question, context, history = [], mentions = { employeeIds: [], departments: [], all: false }) {
    const scope = await AccessScope.forRequest(context, () => this.directoryService.getLiveEmployeeDirectory(context));
    const authorized = AccessScope.authorizeMentions(scope, mentions);
    const text = GroupAskService.plainQuestion(question);
    const lower = text.toLowerCase();
    const hasMentions = authorized.all || authorized.employeeIds.length > 0 || authorized.departments.length > 0;
    const aboutAsker = AskService._mentionsAsker(text);

    // "my team" / "my department": a group around the asker, never someone else's.
    const myTeam = !hasMentions && MY_TEAM.test(lower);
    const myDepartment = !hasMentions && MY_DEPARTMENT.test(lower);
    if ((myTeam || myDepartment) && !scope.viewerEmployeeId) {
      return unknown(Environment.isAuthenticationEnabled() ? UNMATCHED_SELF_REPLY : NO_VERIFIED_SELF_REPLY, ROUTES.EMPLOYEE);
    }

    // People named in the question; "compare my … with @X" includes the asker.
    const employeeIds = [...authorized.employeeIds];
    if (aboutAsker && hasMentions && scope.viewerEmployeeId && !employeeIds.includes(scope.viewerEmployeeId)) {
      employeeIds.push(scope.viewerEmployeeId);
    }

    // One person: the existing single-employee pipeline.
    if (!authorized.all && authorized.departments.length === 0 && employeeIds.length === 1) {
      return this._single(employeeIds[0], text, context, history, scope);
    }
    if (!hasMentions && !myTeam && !myDepartment && (aboutAsker || scope.allScope === 'self')) {
      if (!scope.viewerEmployeeId) {
        return unknown(Environment.isAuthenticationEnabled() ? UNMATCHED_SELF_REPLY : NO_VERIFIED_SELF_REPLY, ROUTES.EMPLOYEE);
      }
      return this._single(scope.viewerEmployeeId, text, context, history, scope);
    }

    // A group, always a subset of scope.
    let members = AccessScope.members(scope, { ...authorized, employeeIds });
    let label = AccessScope.label(scope, { ...authorized, employeeIds });
    if (myTeam) {
      members = scope.entries.filter(entry => entry.employeeId !== scope.viewerEmployeeId);
      label = 'your team';
    } else if (myDepartment) {
      const own = scope.entries.find(entry => entry.employeeId === scope.viewerEmployeeId);
      const department = String(own?.department || '').trim().toLowerCase();
      members = department ? scope.entries.filter(entry => String(entry.department || '').trim().toLowerCase() === department) : [];
      label = own?.department || 'your department';
    }
    return this._group(text, history, context, scope, members, label);
  }

  async _single(employeeId, text, context, history, scope) {
    const entry = scope.entries.find(item => item.employeeId === employeeId);
    const result = await this.askService.ask(employeeId, text, context, history);
    return { ...result, scope: { label: entry?.fullName || employeeId, memberCount: 1 } };
  }

  async _group(text, history, context, scope, members, label) {
    const scopeInfo = { label, memberCount: members.length };
    const finish = async (result, model = null) => {
      await this._audit(text, result, context, model);
      return { ...result, route: result.route || GROUP_ROUTE, scope: scopeInfo };
    };

    const classified = QuestionRouter.classify(text);
    if (classified.route === ROUTES.CONVERSATION) {
      return { ...unknown(classified.reply, ROUTES.CONVERSATION), scope: scopeInfo };
    }
    if (members.length === 0) {
      return finish(unknown(`No employees in your access match ${label}.`, GROUP_ROUTE));
    }

    // Pay questions are never answered, for any scope.
    const organizationKey = OrganizationAnswers.match(text);
    if (organizationKey === 'compensation') {
      return finish({ ...OrganizationAnswers.answer('compensation', {}, []), route: ROUTES.ORGANIZATION });
    }
    if (organizationKey === 'myReportees') {
      if (!scope.viewerEmployeeId) return finish(unknown(NO_VERIFIED_SELF_REPLY, ROUTES.ORGANIZATION));
      const access = { organizationWide: true, viewerEmployeeId: scope.viewerEmployeeId, viewerIsSubject: true };
      return finish({ ...OrganizationAnswers.answer('myReportees', access, scope.entries), route: ROUTES.ORGANIZATION });
    }

    // Directory questions: counts, lists, departments. No per-employee calls.
    const directoryAnswer = GroupAnswers.fromDirectory(text, members, label);
    if (directoryAnswer) return finish(directoryAnswer);

    if (GroupAnswers.asksPerformance(text)) return finish(GroupAnswers.performanceUnavailable(label));

    // Nothing about employees at all: the friendly in-scope reply (no records read).
    const metric = GroupAnswers.metricFor(text);
    if (classified.route === ROUTES.GENERAL && !metric) {
      const general = await this.askGenerator.answerGeneral(text, history, AskService.aiOptions(context));
      if (general) return finish({ ...general, route: ROUTES.GENERAL });
    }

    if (members.length > MAX_GROUP_RECORDS) {
      return finish(unknown(
        `That question covers ${members.length} employees. Narrow it with @ for people or # for a department (up to ${MAX_GROUP_RECORDS} at a time).`,
        GROUP_ROUTE
      ));
    }

    const { records, missing } = await this._buildRecords(members, context);
    if (metric) return finish(GroupAnswers.fromRecords(text, metric, records, label, missing));

    if (records.length === 0) {
      return finish(unknown(`No verified Employee 360 records could be read for ${label}.`, GROUP_ROUTE));
    }
    const aiResult = await this.askGenerator.answerGroupQuestion(records, text, history, label, AskService.aiOptions(context));
    return finish(aiResult, this.askGenerator.provider?.model || null);
  }

  /** Builds each member's Employee 360 (field permissions applied inside), four at a time. */
  async _buildRecords(members, context) {
    const missing = [];
    const built = await mapWithLimit(members, BUILD_CONCURRENCY, async entry => {
      try {
        const canonical = await this.employee360Service.getCanonical360(entry.employeeId, context, { persist: false });
        if (!canonical || canonical.isLiveZohoData !== true) {
          missing.push(entry);
          return null;
        }
        return { entry, canonical };
      } catch (err) {
        Logger.warn('Group Ask could not build an Employee 360 record', { employeeId: entry.employeeId, error: err.message });
        missing.push(entry);
        return null;
      }
    });
    return { records: built.filter(Boolean), missing };
  }

  async _audit(question, result, context, model) {
    try {
      await this.aiInteractionRepository.logInteraction(
        {
          interactionId: crypto.randomUUID(),
          tenantId: context?.tenantId || 'vsk_hr_solution',
          employeeId: 'group',
          userId: context?.user?.userId || 'unknown-user',
          question,
          answer: result.answer,
          confidence: result.confidence,
          evidence: result.evidence || [],
          model,
          createdAt: new Date()
        },
        context
      );
    } catch (err) {
      Logger.warn('AI interaction audit persistence failed', { employeeId: 'group', error: err.message });
    }
  }
}

module.exports = GroupAskService;
