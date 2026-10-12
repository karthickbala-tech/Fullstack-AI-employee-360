'use strict';

const crypto = require('crypto');
const Employee360Service = require('./employee360Service');
const AskGenerator = require('../ai/askGenerator');
const QuestionRouter = require('../ai/questionRouter');
const DeterministicAnswers = require('../ai/deterministicAnswers');
const OrganizationAnswers = require('../ai/organizationAnswers');
const ZohoPeopleEmployeeService = require('../connectors/zohoPeople/zohoPeopleEmployeeService');
const Environment = require('../config/environment');
const AuthorizationBoundary = require('../middleware/authorization');
const AIInteractionRepository = require('../repositories/aiInteractionRepository');
const { DATA_CLASSIFICATION, CONFIDENCE_LEVELS } = require('../config/constants');
const Logger = require('../utils/logger');

const { ROUTES } = QuestionRouter;

// First-person words that make a question about the asker, and words that point
// at someone else (the employee being viewed or another person).
const FIRST_PERSON = /\b(i|i'm|i've|me|my|mine|myself)\b/;
const OTHER_PERSON = /\b(this employee|the employee|this person|he|she|him|his|her|hers|they|them|their|theirs)\b/;
// Ways of asking that use "me"/"I" without being about the asker ("show me her
// attendance", "can I see this employee's tenure").
const REQUEST_PHRASES = /\b((show|tell|give|let|help|send|remind|get|find|fetch|bring|list|explain to) me|(can|could|may|should|would|shall) i|i( would|'d)? (like|want|need|wish) to (know|see|understand|check|find out|ask)|i('d| would) like)\b/g;

const UNMATCHED_VIEWER_REPLY =
  "I couldn't match your sign-in to a single employee record in Zoho People, so I can't answer questions about you.";
const MIXED_SUBJECT_REPLY =
  'Please ask about yourself and about this employee in separate questions, so each answer comes from the right record.';

class AskService {
  constructor() {
    this.employee360Service = new Employee360Service();
    this.askGenerator = new AskGenerator();
    this.aiInteractionRepository = new AIInteractionRepository();
    this.directoryService = new ZohoPeopleEmployeeService();
  }

  /**
   * Organization-level access for the caller. Without authentication
   * (Development only) every request is unrestricted, and "me" means the
   * employee being viewed, matching how the rest of Ask reads "my".
   */
  static _organizationAccess(employeeId, context) {
    if (!Environment.isAuthenticationEnabled()) {
      return { organizationWide: true, viewerEmployeeId: employeeId, viewerIsSubject: null };
    }
    const user = context?.user || {};
    return {
      // Only the explicit organizationAccess policy grants organization-wide
      // answers; an admin role label (Catalyst or Zoho) does not.
      organizationWide: user.organizationAccess === true,
      viewerEmployeeId: user.employeeId || null,
      viewerIsSubject: user.employeeId ? user.employeeId === employeeId : null
    };
  }

  /**
   * Decides whose Employee 360 record answers an employee-path question. With
   * authentication on, a question about the asker ("my attendance", "when did I
   * join?", or a short follow-up to one) is about the signed-in employee, never
   * the employee selected in the UI. Returns { subjectId } or { refusal }.
   */
  static _resolveSubject(employeeId, question, history, context) {
    if (!Environment.isAuthenticationEnabled()) return { subjectId: employeeId };

    const lastUserTurn = [...history].reverse().find(turn => turn.role === 'user');
    const aboutAsker = AskService._isAboutAsker(question) ||
      (QuestionRouter.isFollowUp(question) && Boolean(lastUserTurn) && AskService._isAboutAsker(lastUserTurn.content));
    if (!aboutAsker) {
      if (AskService._mentionsAsker(question) && AskService._mentionsOther(question)) {
        return { refusal: MIXED_SUBJECT_REPLY };
      }
      return { subjectId: employeeId };
    }

    const viewerId = context?.user?.employeeId || null;
    if (!viewerId) return { refusal: UNMATCHED_VIEWER_REPLY };
    // The signed-in employee's own record is always inside their scope; checked anyway.
    AuthorizationBoundary.enforceEmployeeScope(context, viewerId);
    return { subjectId: viewerId };
  }

  /** Lower-cases and drops request phrasing ("show me", "can I") that is not about the asker. */
  static _normalizeForSubject(question) {
    return String(question || '')
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(REQUEST_PHRASES, ' ');
  }

  static _mentionsAsker(question) {
    return FIRST_PERSON.test(AskService._normalizeForSubject(question));
  }

  static _mentionsOther(question) {
    return OTHER_PERSON.test(AskService._normalizeForSubject(question));
  }

  static _isAboutAsker(question) {
    return AskService._mentionsAsker(question) && !AskService._mentionsOther(question);
  }

  async ask(employeeId, question, context, history = []) {
    const timer = AskService._startTimer();
    try {
      const result = await this._answer(employeeId, question, context, history, timer);
      timer.log(employeeId, result.route);
      return result;
    } catch (err) {
      timer.log(employeeId, 'error');
      throw err;
    }
  }

  /**
   * Collects per-stage durations for one Ask request and logs them as a single
   * line. Only timings, route and counts are logged, never question or data content.
   */
  static _startTimer() {
    const startedAt = Date.now();
    const stages = {};
    return {
      async measure(stage, work) {
        const stageStart = Date.now();
        try {
          return await work();
        } finally {
          stages[stage] = (stages[stage] || 0) + (Date.now() - stageStart);
        }
      },
      log(employeeId, route) {
        Logger.info('Ask timing', { employeeId, route, totalMs: Date.now() - startedAt, stagesMs: stages });
      }
    };
  }

  async _answer(employeeId, question, context, history, timer) {
    const classified = QuestionRouter.classify(question);
    const { reply } = classified;
    // An exact profile question belongs to the employee path even when it has
    // no strong HR keyword ("when did I join?"), so it never costs a general AI call.
    // A short follow-up to an employee question ("what about last month?") also
    // goes straight to the employee path instead of costing a general AI call first.
    const lastUserTurn = [...history].reverse().find(turn => turn.role === 'user');
    const followsEmployeeQuestion = Boolean(lastUserTurn) &&
      QuestionRouter.isFollowUp(question) &&
      QuestionRouter.classify(lastUserTurn.content).route === ROUTES.EMPLOYEE;
    const route = classified.route === ROUTES.GENERAL &&
      (DeterministicAnswers.match(question) || followsEmployeeQuestion)
      ? ROUTES.EMPLOYEE
      : classified.route;

    // Greetings and small talk: no employee data, no AI call, nothing to audit.
    if (route === ROUTES.CONVERSATION) {
      Logger.info('Ask answered on the conversation fast path', { employeeId });
      return {
        answer: reply,
        type: DATA_CLASSIFICATION.UNKNOWN,
        confidence: CONFIDENCE_LEVELS.UNKNOWN,
        evidence: [],
        limitations: [],
        route
      };
    }

    // Organization-level questions (headcount, team, pay): deterministic, scoped
    // to the caller, and never sent to AI.
    const organizationKey = OrganizationAnswers.match(question);
    if (organizationKey) {
      const access = AskService._organizationAccess(employeeId, context);
      const directoryAllowed = organizationKey === 'myReportees' ? Boolean(access.viewerEmployeeId) : access.organizationWide;
      const directory = OrganizationAnswers.needsDirectory(organizationKey) && directoryAllowed
        ? await timer.measure('directory', () => this.directoryService.getLiveEmployeeDirectory(context))
        : [];
      const organizationResult = OrganizationAnswers.answer(organizationKey, access, directory);
      Logger.info('Ask answered on the organization path', { employeeId, questionKind: organizationKey });
      await timer.measure('audit', () => this._audit(employeeId, question, organizationResult, context, null));
      return { ...organizationResult, route: ROUTES.ORGANIZATION };
    }

    // General questions: answered without any Employee 360 context, unless the
    // model hands the question back to the employee path.
    if (route === ROUTES.GENERAL) {
      const generalResult = await timer.measure('generalAi', () => this.askGenerator.answerGeneral(question, history));
      if (generalResult) {
        Logger.info('Ask answered on the general path', { employeeId });
        await timer.measure('audit', () => this._audit(employeeId, question, generalResult, context));
        return { ...generalResult, route };
      }
      Logger.info('General path handed the question to the employee path', { employeeId });
    }

    // "my"/"me" questions are about the signed-in employee, not the selected one.
    const subject = AskService._resolveSubject(employeeId, question, history, context);
    if (subject.refusal) {
      Logger.info('Ask could not resolve whose record the question is about', { employeeId });
      return {
        answer: subject.refusal,
        type: DATA_CLASSIFICATION.UNKNOWN,
        confidence: CONFIDENCE_LEVELS.UNKNOWN,
        evidence: [],
        limitations: [],
        route: ROUTES.EMPLOYEE
      };
    }
    const subjectId = subject.subjectId;
    const subjectMeta = subjectId === employeeId ? {} : { subjectEmployeeId: subjectId };

    const canonical = await timer.measure('employee360', () => this.employee360Service.getCanonical360(
      subjectId,
      context,
      { persist: false }
    ));

    // Exact profile questions are answered from the canonical model with no AI call.
    const viewerIsSubject = context?.user?.employeeId ? context.user.employeeId === subjectId : null;
    const deterministicResult = DeterministicAnswers.answer(question, canonical, { viewerIsSubject });
    if (deterministicResult) {
      Logger.info('Ask answered deterministically from Employee 360 data', { employeeId: subjectId });
      await timer.measure('audit', () => this._audit(subjectId, question, deterministicResult, context, null));
      return { ...deterministicResult, route: ROUTES.DETERMINISTIC, ...subjectMeta };
    }

    const answerResult = await timer.measure('employeeAi', () => this.askGenerator.answerQuestion(
      canonical,
      question,
      history
    ));

    await timer.measure('audit', () => this._audit(subjectId, question, answerResult, context));

    return { ...answerResult, route: ROUTES.EMPLOYEE, ...subjectMeta };
  }

  async _audit(employeeId, question, answerResult, context, model = this.askGenerator.provider?.model || null) {
    try {
      await this.aiInteractionRepository.logInteraction(
        {
          interactionId: crypto.randomUUID(),
          tenantId: context?.tenantId || 'vsk_hr_solution',
          employeeId,
          userId: context?.user?.userId || 'unknown-user',
          question,
          answer: answerResult.answer,
          confidence: answerResult.confidence,
          evidence: answerResult.evidence || [],
          model,
          createdAt: new Date()
        },
        context
      );
    } catch (logErr) {
      Logger.warn('AI interaction audit persistence failed', {
        employeeId,
        error: logErr.message
      });
    }
  }
}

module.exports = AskService;
