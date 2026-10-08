'use strict';

/**
 * Exact answers for simple profile questions, taken straight from the canonical
 * Employee 360 model, so no AI call is needed. Only whole-question patterns
 * match; anything else returns null and continues to the AI employee path.
 *
 * Every factual answer cites evidence that exists in canonical.evidence. A
 * missing value is reported as not recorded, never guessed.
 */

const { DATA_CLASSIFICATION, CONFIDENCE_LEVELS } = require('../config/constants');

// "my" (first person) or an explicit reference to the employee being viewed.
const SUBJECT = "(my|this employee's|the employee's)";

const MATCHERS = [
  {
    key: 'department',
    patterns: [
      new RegExp(`^what is ${SUBJECT} department$`),
      /^(which|what) department (am i in|do i work in|do i belong to)$/,
      /^(which|what) department is (this|the) employee in$/
    ]
  },
  {
    key: 'designation',
    patterns: [
      new RegExp(`^what is ${SUBJECT} (current )?(designation|job title|title)$`)
    ]
  },
  {
    key: 'dateOfJoining',
    patterns: [
      /^when did i (join|start)( working)?( here| the company)?$/,
      /^when did (this|the) employee join( the company)?$/,
      new RegExp(`^what is ${SUBJECT} (joining date|date of joining|start date)$`)
    ]
  },
  {
    key: 'tenure',
    patterns: [
      /^how long have i (worked|been working|been) (here|at the company|in the company|with the company)$/,
      /^how long has (this|the) employee (worked|been working|been) (here|at the company|in the company|with the company)$/,
      new RegExp(`^what is ${SUBJECT} tenure$`)
    ]
  },
  {
    key: 'manager',
    patterns: [
      new RegExp(`^who is ${SUBJECT} (manager|reporting manager)$`),
      /^who do i report to( at work)?$/,
      /^who does (this|the) employee report to$/
    ]
  },
  {
    key: 'employmentStatus',
    patterns: [
      new RegExp(`^what is ${SUBJECT} (current )?(employment status|employee status|status)$`)
    ]
  },
  {
    key: 'isActive',
    patterns: [
      /^am i (an )?active( employee)?$/,
      /^is (this|the) employee active$/
    ]
  }
];

function normalize(question) {
  return String(question || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\bwhat's\b|\bwhats\b/g, 'what is')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ please$/, '')
    .replace(/^please /, '');
}

function isFirstPerson(text) {
  return /\b(i|my|me)\b/.test(text);
}

function present(value) {
  return typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined;
}

/**
 * Builds the answer for a matched question.
 * `you` / `your` read naturally for both "my" and "this employee" questions.
 */
function answerFor(key, canonical, firstPerson) {
  const your = firstPerson ? 'Your' : "This employee's";
  const you = firstPerson ? 'You' : 'This employee';
  const youLower = firstPerson ? 'you' : 'this employee';

  const org = canonical.organisation || {};
  const emp = canonical.employment || {};
  const tenure = canonical.deterministicMetrics?.tenure;

  switch (key) {
    case 'department':
      return present(org.department)
        ? fact(`${your} department is **${org.department}**.`, ['organisation.department'])
        : missing(`${your} department isn't recorded in Zoho People.`, 'Department is not recorded in the Zoho People employee record.');

    case 'designation':
      return present(emp.jobTitle)
        ? fact(`${your} designation is **${emp.jobTitle}**.`, ['employment.jobTitle'])
        : missing(`${your} designation isn't recorded in Zoho People.`, 'Designation is not recorded in the Zoho People employee record.');

    case 'dateOfJoining':
      return present(emp.dateOfJoining)
        ? fact(`${you} joined on **${emp.dateOfJoining}**.`, ['employment.dateOfJoining'])
        : missing(`${your} joining date isn't recorded in Zoho People.`, 'Date of joining is not recorded in the Zoho People employee record.');

    case 'tenure':
      return present(tenure?.formatted) && tenure.formatted !== 'Unknown'
        ? {
            ...fact(
              `${you} ${firstPerson ? 'have' : 'has'} worked here for **${tenure.formatted}**` +
                (present(emp.dateOfJoining) ? ` (since ${emp.dateOfJoining}).` : '.'),
              ['employment.tenure', 'employment.dateOfJoining']
            ),
            type: DATA_CLASSIFICATION.CALCULATION
          }
        : missing(
            `${your} tenure can't be calculated because no joining date is recorded in Zoho People.`,
            'Tenure requires a date of joining, which is not recorded in the Zoho People employee record.'
          );

    case 'manager':
      return present(org.reportingManagerName)
        ? fact(
            `${your} reporting manager is recorded in Zoho People as **${org.reportingManagerName}**.`,
            ['organisation.reportingManagerName']
          )
        : missing(
            `No reporting manager is recorded for ${youLower} in Zoho People.`,
            'Reporting To is not recorded in the Zoho People employee record.'
          );

    case 'employmentStatus':
      return present(emp.employmentStatus)
        ? fact(`${your} employment status is **${emp.employmentStatus}**.`, ['employment.employmentStatus'])
        : missing(`${your} employment status isn't recorded in Zoho People.`, 'Employee status is not recorded in the Zoho People employee record.');

    case 'isActive': {
      if (!present(emp.employmentStatus)) {
        return missing(`${your} employment status isn't recorded in Zoho People.`, 'Employee status is not recorded in the Zoho People employee record.');
      }
      const active = emp.employmentStatus.trim().toLowerCase() === 'active';
      return fact(
        `${active ? 'Yes' : 'No'}, ${your.toLowerCase()} employment status is **${emp.employmentStatus}**.`,
        ['employment.employmentStatus']
      );
    }

    default:
      return null;
  }
}

function fact(answer, evidence) {
  return {
    answer,
    type: DATA_CLASSIFICATION.FACT,
    confidence: CONFIDENCE_LEVELS.HIGH,
    evidence,
    limitations: []
  };
}

function missing(answer, limitation) {
  return {
    answer,
    type: DATA_CLASSIFICATION.UNKNOWN,
    confidence: CONFIDENCE_LEVELS.UNKNOWN,
    evidence: [],
    limitations: [limitation]
  };
}

class DeterministicAnswers {
  /** Returns the matched field key, or null when the question is not an exact profile question. */
  static match(question) {
    const text = normalize(question);
    for (const { key, patterns } of MATCHERS) {
      if (patterns.some(pattern => pattern.test(text))) {
        return { key, firstPerson: isFirstPerson(text) };
      }
    }
    return null;
  }

  /**
   * Returns an Ask response built only from canonical data, or null to continue
   * to the AI path. A factual answer whose evidence is not present in
   * canonical.evidence is never returned.
   */
  static answer(question, canonical) {
    if (!canonical || canonical.isLiveZohoData !== true) return null;

    const matched = DeterministicAnswers.match(question);
    if (!matched) return null;

    const result = answerFor(matched.key, canonical, matched.firstPerson);
    if (!result) return null;

    if (result.type !== DATA_CLASSIFICATION.UNKNOWN) {
      const available = new Set(
        (canonical.evidence || [])
          .filter(item => item && item.domain && item.field)
          .map(item => `${item.domain}.${item.field}`)
      );
      result.evidence = result.evidence.filter(reference => available.has(reference));
      if (result.evidence.length === 0) return null;
    }

    return result;
  }
}

module.exports = DeterministicAnswers;
