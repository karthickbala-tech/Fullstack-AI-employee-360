'use strict';

/**
 * Deterministic answers for questions about a group of employees (the whole
 * authorized scope, a team, a department or several mentioned people). Every
 * member passed in is already inside the caller's scope; nothing here widens it.
 *
 * - Directory questions (counts, lists, department breakdown) use the live
 *   directory entries only: no per-employee Zoho calls.
 * - Metric questions (attendance %, late days, leave use, tenure) rank, average or
 *   list verified per-employee values and cite "<employeeId>:<domain>.<field>".
 * - Performance comparisons are reported as unavailable: no verified rating source.
 */

const { DATA_CLASSIFICATION, CONFIDENCE_LEVELS } = require('../config/constants');

const MAX_LISTED = 30;

const PEOPLE = /\b(users?|employees?|people|persons?|staff|members?|team|workforce|headcount)\b/;
const COUNT = /\b(how many|number of|count|total|headcount)\b/;
const LIST = /\b(list|show|who are|who is|who s|names?|which)\b/;
const BARE_PEOPLE = /^(all |the )?(active |inactive )?(users?|employees?|people|staff|members|team)( list)?$/;
const BY_DEPARTMENT = /\b((by|per|each|every|across) departments?|department ?wise|departments? (breakdown|split|distribution|count)|in each department)\b/;
const PERFORMANCE = /\b(perform\w*|ratings?|rated|appraisals?|kpis?|okrs?|top performers?|best employees?|productiv\w*)\b/;

const DESCENDING = /\b(highest|most|best|top|maximum|max|longest|greatest|more|senior ?most|most experienced)\b/;
const ASCENDING = /\b(lowest|least|fewest|worst|minimum|min|shortest|newest|latest|recent(ly)?|less)\b/;
const AVERAGE = /\b(average|avg|mean)\b/;

const METRICS = [
  {
    key: 'lateDays',
    test: /\b(late|lateness|punctual\w*|tardy)\b/,
    label: 'late days',
    ref: 'attendance.lateDays',
    value: canonical => (Number.isFinite(canonical.attendance?.lateDays) ? canonical.attendance.lateDays : null),
    format: value => `${value} late day${value === 1 ? '' : 's'}`,
    average: value => `${round1(value)} late days`
  },
  {
    key: 'attendancePercentage',
    test: /\b(attendance|present|absent\w*|absence)\b/,
    label: 'attendance',
    ref: 'attendance.attendancePercentage',
    value: canonical => finite(canonical.deterministicMetrics?.attendancePercentage?.value),
    format: value => `${value}%`,
    average: value => `${round1(value)}%`
  },
  {
    key: 'leaveUtilization',
    test: /\b(leaves?|time off|vacation)\b/,
    label: 'leave utilization',
    ref: 'leave.leaveUtilization',
    value: canonical => finite(canonical.deterministicMetrics?.leaveUtilization?.value),
    format: value => `${value}% of entitled leave used`,
    average: value => `${round1(value)}% of entitled leave used`
  },
  {
    key: 'tenure',
    test: /\b(tenure|serving|experienced|seniority|joined|joining|newest|longest|years? of service)\b/,
    label: 'tenure',
    ref: 'employment.tenure',
    value: canonical => {
      const tenure = canonical.deterministicMetrics?.tenure;
      return tenure && tenure.formatted !== 'Unknown' ? finite(tenure.totalDays) : null;
    },
    format: (value, canonical) => {
      const joined = canonical.employment?.dateOfJoining;
      const formatted = canonical.deterministicMetrics?.tenure?.formatted || `${value} days`;
      return joined ? `${formatted} (joined ${joined})` : formatted;
    },
    average: value => formatDays(value)
  }
];

function finite(value) {
  return Number.isFinite(value) ? value : null;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function formatDays(days) {
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  return `${years} yr${years === 1 ? '' : 's'} ${months} mo${months === 1 ? '' : 's'}`;
}

function normalize(question) {
  return String(question || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/(^|\s)[@#](?=\S)/g, '$1')
    .replace(/\bwhat's\b/g, 'what is')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const isActive = entry => String(entry.status || '').trim().toLowerCase() === 'active';
const nameOf = entry => (entry.fullName ? `${entry.fullName} (${entry.employeeId})` : entry.employeeId);

function result(answer, type, confidence, evidence, limitations = []) {
  return { answer, type, confidence, evidence, limitations };
}

function unknown(answer, limitation) {
  return result(answer, DATA_CLASSIFICATION.UNKNOWN, CONFIDENCE_LEVELS.UNKNOWN, [], limitation ? [limitation] : []);
}

class GroupAnswers {
  static normalize(question) {
    return normalize(question);
  }

  /** The metric a question is about, or null. */
  static metricFor(question) {
    const text = normalize(question);
    return METRICS.find(metric => metric.test.test(text)) || null;
  }

  static asksPerformance(question) {
    return PERFORMANCE.test(normalize(question));
  }

  static performanceUnavailable(label) {
    return unknown(
      `Performance ratings aren't available from Zoho People for Employee 360, so I can't rank or compare performance in ${label}. ` +
        'I can compare verified attendance, late days, leave use and tenure instead.',
      'No verified performance rating source is connected to Employee 360.'
    );
  }

  /**
   * Counts, lists and department breakdowns from directory entries. Returns null
   * when the question is not one of these.
   */
  static fromDirectory(question, members, label) {
    const text = normalize(question);
    if (GroupAnswers.metricFor(text) || PERFORMANCE.test(text)) return null;

    if (BY_DEPARTMENT.test(text)) return GroupAnswers._byDepartment(members, label);

    const onlyInactive = /\binactive\b/.test(text);
    const onlyActive = !onlyInactive && /\bactive\b/.test(text);
    const asksPeople = PEOPLE.test(text);

    if (BARE_PEOPLE.test(text) || (asksPeople && LIST.test(text) && !COUNT.test(text))) {
      return GroupAnswers._list(members, label, { onlyActive, onlyInactive });
    }
    if ((asksPeople && COUNT.test(text)) || /\bheadcount\b/.test(text)) {
      return GroupAnswers._count(members, label, { onlyInactive });
    }
    return null;
  }

  static _count(members, label, { onlyInactive }) {
    const active = members.filter(isActive).length;
    if (onlyInactive) {
      return result(
        `There ${members.length - active === 1 ? 'is' : 'are'} **${members.length - active} inactive** employee record${members.length - active === 1 ? '' : 's'} in ${label} (**${members.length}** in total).`,
        DATA_CLASSIFICATION.CALCULATION, CONFIDENCE_LEVELS.HIGH, ['directory.employmentStatus']
      );
    }
    return result(
      `There ${active === 1 ? 'is' : 'are'} **${active} active** employee${active === 1 ? '' : 's'} in ${label} (**${members.length}** employee record${members.length === 1 ? '' : 's'} in total).`,
      DATA_CLASSIFICATION.CALCULATION, CONFIDENCE_LEVELS.HIGH, ['directory.employmentStatus']
    );
  }

  static _list(members, label, { onlyActive, onlyInactive }) {
    const chosen = members
      .filter(entry => (onlyActive ? isActive(entry) : onlyInactive ? !isActive(entry) : true))
      .sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || String(a.fullName || '').localeCompare(String(b.fullName || '')));
    const kind = onlyActive ? 'active ' : onlyInactive ? 'inactive ' : '';
    if (chosen.length === 0) {
      return result(`No ${kind}employees are recorded in ${label}.`, DATA_CLASSIFICATION.FACT, CONFIDENCE_LEVELS.HIGH, ['directory.employmentStatus']);
    }
    const lines = chosen.slice(0, MAX_LISTED).map(entry =>
      `- **${nameOf(entry)}** · ${entry.department || 'Department not recorded'} · ${entry.status || 'Status not recorded'}`
    );
    if (chosen.length > MAX_LISTED) lines.push(`- …and ${chosen.length - MAX_LISTED} more`);
    const active = members.filter(isActive).length;
    const headline = onlyActive || onlyInactive
      ? `**${chosen.length} ${kind}employee${chosen.length === 1 ? '' : 's'}** in ${label}:`
      : `**${chosen.length} employee${chosen.length === 1 ? '' : 's'}** in ${label} (**${active} active**):`;
    return result([headline, ...lines].join('\n'), DATA_CLASSIFICATION.FACT, CONFIDENCE_LEVELS.HIGH,
      ['directory.employmentStatus', 'directory.department']);
  }

  static _byDepartment(members, label) {
    const counts = new Map();
    for (const entry of members.filter(isActive)) {
      const department = entry.department || 'Department not recorded';
      counts.set(department, (counts.get(department) || 0) + 1);
    }
    if (counts.size === 0) return unknown(`No active employees are recorded in ${label}.`, 'No active employee records found.');
    const rows = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([department, count]) => `- **${department}**: ${count}`);
    return result([`Active employees by department in ${label}:`, ...rows].join('\n'),
      DATA_CLASSIFICATION.CALCULATION, CONFIDENCE_LEVELS.HIGH, ['directory.employmentStatus', 'directory.department']);
  }

  /**
   * Ranks, averages or lists one verified metric across the members' records.
   * @param {Array<{entry: object, canonical: object}>} records members with a built Employee 360
   * @param {Array<object>} missing members whose record could not be built
   */
  static fromRecords(question, metric, records, label, missing = []) {
    const text = normalize(question);
    const withValue = [];
    const withoutValue = [...missing];
    for (const record of records) {
      const value = metric.value(record.canonical);
      if (value === null) withoutValue.push(record.entry);
      else withValue.push({ ...record, value });
    }

    const total = records.length + missing.length;
    if (withValue.length === 0) {
      return unknown(
        `${capitalize(metric.label)} isn't recorded in Zoho People for any of the ${total} employee${total === 1 ? '' : 's'} in ${label}.`,
        `${capitalize(metric.label)} not recorded.`
      );
    }

    const evidence = withValue
      .filter(item => hasEvidence(item.canonical, metric.ref))
      .map(item => `${item.entry.employeeId}:${metric.ref}`);
    const notRecorded = withoutValue.length > 0
      ? `\n\nNot recorded for: ${withoutValue.map(nameOf).join(', ')}.`
      : '';

    if (AVERAGE.test(text)) {
      const mean = withValue.reduce((sum, item) => sum + item.value, 0) / withValue.length;
      return result(
        `Average ${metric.label} in ${label}: **${metric.average(mean)}** (across ${withValue.length} of ${total} employees with a recorded value).${notRecorded}`,
        DATA_CLASSIFICATION.CALCULATION, CONFIDENCE_LEVELS.HIGH, evidence
      );
    }

    // "lowest / least / worst / newest / joined recently" sort ascending; "highest / most / best" descending.
    const ascending = ASCENDING.test(text);
    const descending = !ascending && DESCENDING.test(text);
    const sorted = [...withValue].sort((a, b) => (ascending ? a.value - b.value : b.value - a.value));
    const ranking = sorted.slice(0, MAX_LISTED).map(item => `- **${nameOf(item.entry)}**: ${metric.format(item.value, item.canonical)}`);

    if (ascending || descending) {
      const edge = sorted[0].value;
      const leaders = sorted.filter(item => item.value === edge);
      const word = ascending ? (metric.key === 'tenure' ? 'shortest' : 'lowest') : (metric.key === 'tenure' ? 'longest' : 'highest');
      const who = leaders.map(item => `**${nameOf(item.entry)}**`).join(', ');
      const headline = `${who} ${leaders.length === 1 ? 'has' : 'have'} the ${word} ${metric.label} in ${label}: **${metric.format(edge, leaders[0].canonical)}**.`;
      return result([headline, '', 'All recorded values:', ...ranking].join('\n') + notRecorded,
        DATA_CLASSIFICATION.CALCULATION, CONFIDENCE_LEVELS.HIGH, evidence);
    }

    return result([`${capitalize(metric.label)} in ${label}:`, ...ranking].join('\n') + notRecorded,
      DATA_CLASSIFICATION.CALCULATION, CONFIDENCE_LEVELS.HIGH, evidence);
  }
}

function hasEvidence(canonical, ref) {
  return (canonical.evidence || []).some(item => item && `${item.domain}.${item.field}` === ref);
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

module.exports = GroupAnswers;
