'use strict';

/**
 * Organization-level Ask questions, answered deterministically from the live
 * Zoho People directory (never by AI), and only within the caller's scope:
 * - headcount / headcount by department: organization-wide access only;
 * - "who reports to me": the verified reportingManagerId relationships;
 * - compensation: always unavailable (no verified payroll source exists);
 * - organization-wide attendance/leave: not aggregated, reported as unavailable.
 */

const { DATA_CLASSIFICATION, CONFIDENCE_LEVELS } = require('../config/constants');

const PATTERNS = {
  // Checked first: any pay question, about anyone, never reaches AI.
  compensation: [/\b(salary|salaries|payroll|payslips?|compensation|ctc|bonus(es)?|wages?|pay ?outs?|remuneration)\b/],
  orgAttendanceLeave: [
    /\b(average|overall|total|organi[sz]ation|organi[sz]ation's|company|company's|all employees|each department|every department|which departments?|department wise|across)\b.*\b(attendance|absence|absences|absent|leaves?|leave utili[sz]ation)\b/,
    /\b(attendance|absence|absences|absent|leaves?|leave utili[sz]ation)\b.*\b(organi[sz]ation|company|all employees|each department|every department|which departments?|department wise|across)\b/
  ],
  departmentBreakdown: [
    /^how many (employees|people|staff) (are )?(there )?(in|per|by) (each|every) department$/,
    /^how many (employees|people|staff) (are )?(there )?(per|by) department$/,
    /^(what is the )?(headcount|employee count) (by|per|for each) department$/,
    /^(show|list)( me)? (the )?(headcount|employees|employee count) by department$/
  ],
  headcount: [
    /^how many (active )?(employees|people|staff)( are there| do we have| work here| are in (the|our) (company|organi[sz]ation)| in (the|our) (company|organi[sz]ation))?$/,
    /^what is (the|our) (total )?(headcount|employee count)$/,
    /^(total )?headcount$/
  ],
  myReportees: [
    /^who reports to me$/,
    /^how many (people|employees|staff|direct reports|reportees) (report to me|do i have)$/,
    /^(list|show)( me)? my (team|reportees|direct reports)$/,
    /^who (is|are) (in )?my team$/
  ]
};

function normalize(question) {
  return String(question || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\bwhat's\b|\bwhats\b/g, 'what is')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function result(answer, type, confidence, evidence, limitations = []) {
  return { answer, type, confidence, evidence, limitations };
}

function unavailable(answer, limitation) {
  return result(answer, DATA_CLASSIFICATION.UNKNOWN, CONFIDENCE_LEVELS.UNKNOWN, [], [limitation]);
}

const isActive = entry => String(entry.status || '').trim().toLowerCase() === 'active';
const label = entry => (entry.fullName ? `${entry.fullName} (${entry.employeeId})` : entry.employeeId);

class OrganizationAnswers {
  /** Returns the matched question key, or null. */
  static match(question) {
    const text = normalize(question);
    for (const [key, patterns] of Object.entries(PATTERNS)) {
      if (patterns.some(pattern => pattern.test(text))) return key;
    }
    return null;
  }

  /** Whether answering this key needs the live employee directory. */
  static needsDirectory(key) {
    return key === 'headcount' || key === 'departmentBreakdown' || key === 'myReportees';
  }

  /**
   * @param {string} key matched question key
   * @param {object} access { organizationWide: boolean, viewerEmployeeId: string|null, viewerIsSubject: boolean }
   * @param {Array}  directory live directory entries (only for keys that need it)
   */
  static answer(key, access, directory = []) {
    switch (key) {
      case 'compensation':
        return unavailable(
          "Salary and compensation data aren't available in Employee 360: no verified payroll source is connected, so I can't answer pay questions for anyone.",
          'No verified compensation source is connected to Employee 360.'
        );

      case 'orgAttendanceLeave':
        return unavailable(
          "Organization-wide attendance and leave figures aren't available yet. Employee 360 calculates attendance and leave per employee, not across the organization.",
          'Attendance and leave are not aggregated across employees.'
        );

      case 'headcount':
      case 'departmentBreakdown':
        if (!access.organizationWide) {
          return unavailable(
            "Organization-wide figures are outside your access. I can answer questions about your own record and, if you manage people, your direct reports.",
            'Requires organization-wide access.'
          );
        }
        return key === 'headcount'
          ? OrganizationAnswers._headcount(directory)
          : OrganizationAnswers._departmentBreakdown(directory);

      case 'myReportees':
        return OrganizationAnswers._reportees(access, directory);

      default:
        return null;
    }
  }

  static _headcount(directory) {
    const active = directory.filter(isActive).length;
    return result(
      `There are **${active} active employees** in Zoho People (**${directory.length}** employee records in total).`,
      DATA_CLASSIFICATION.CALCULATION,
      CONFIDENCE_LEVELS.HIGH,
      ['directory.employmentStatus']
    );
  }

  static _departmentBreakdown(directory) {
    const counts = new Map();
    for (const entry of directory.filter(isActive)) {
      const department = entry.department || 'Department not recorded';
      counts.set(department, (counts.get(department) || 0) + 1);
    }
    if (counts.size === 0) {
      return unavailable('No active employees are recorded in Zoho People.', 'No active employee records found.');
    }
    const rows = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([department, count]) => `- **${department}**: ${count}`);
    return result(
      ['Active employees by department:', ...rows].join('\n'),
      DATA_CLASSIFICATION.CALCULATION,
      CONFIDENCE_LEVELS.HIGH,
      ['directory.employmentStatus', 'directory.department']
    );
  }

  static _reportees(access, directory) {
    const managerId = access.viewerEmployeeId;
    if (!managerId) {
      return unavailable(
        "I couldn't match your sign-in to an employee record, so I can't look up who reports to you.",
        'Signed-in user is not matched to a unique employee record.'
      );
    }

    const you = access.viewerIsSubject === false ? 'this employee' : 'you';
    const reportees = directory.filter(entry => entry.reportingManagerId === managerId && entry.employeeId !== managerId);
    if (reportees.length === 0) {
      return result(
        `No one is recorded in Zoho People as reporting to ${you}.`,
        DATA_CLASSIFICATION.FACT,
        CONFIDENCE_LEVELS.HIGH,
        ['directory.reportingManagerId']
      );
    }
    return result(
      `**${reportees.length}** ${reportees.length === 1 ? 'person reports' : 'people report'} to ${you}: ${reportees.map(label).join(', ')}.`,
      DATA_CLASSIFICATION.FACT,
      CONFIDENCE_LEVELS.HIGH,
      ['directory.reportingManagerId']
    );
  }
}

module.exports = OrganizationAnswers;
