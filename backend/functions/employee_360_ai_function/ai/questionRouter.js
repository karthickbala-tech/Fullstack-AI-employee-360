'use strict';

/**
 * Deterministic first pass over an Ask question. It decides the cheapest safe path:
 * - 'conversation': the whole message is a greeting or small talk; answered here,
 *   with no Zoho People call, no Employee 360 context and no AI call.
 * - 'general': no employee/HR signal at all; may be answered by AI without any
 *   Employee 360 context (the AI can still hand it back to the employee path).
 * - 'employee': everything else, handled by the existing Employee 360 path.
 *
 * Routing never grants access to data: the conversation and general paths
 * receive no employee data, and the employee path keeps its own boundary.
 */

const ROUTES = Object.freeze({
  CONVERSATION: 'conversation',
  GENERAL: 'general',
  EMPLOYEE: 'employee',
  // Employee path answered from canonical data without AI (set by AskService).
  DETERMINISTIC: 'deterministic'
});

const CAPABILITIES_REPLY =
  "I'm the Employee 360 assistant. I can answer questions about this employee's verified " +
  'Zoho People record, such as role, department, tenure, attendance, leave and lifecycle events, ' +
  "and I'll say clearly when something isn't recorded. I can also help with general questions.";

// Each pattern must match the whole normalized message, so "hi, what is my
// attendance?" is never mistaken for a plain greeting.
const CONVERSATION_REPLIES = [
  {
    pattern: /^(hi|hello|hey|hiya|hey there|hi there|hello there|greetings|namaste|vanakkam|good (morning|afternoon|evening))( team| all| everyone)?$/,
    reply: 'Hi! How can I help you today?'
  },
  {
    pattern: /^(how are you|how are you doing|how is it going|how's it going|hows it going|how do you do)$/,
    reply: "I'm doing well, thanks for asking. What would you like to know?"
  },
  {
    pattern: /^(thanks|thank you|thank you so much|thanks a lot|thanks so much|many thanks|ty|cheers)$/,
    reply: "You're welcome! Let me know if there's anything else."
  },
  {
    pattern: /^(ok|okay|cool|great|nice|got it|alright|all right|sure|perfect|awesome)$/,
    reply: 'Glad that helps. Anything else you would like to check?'
  },
  {
    pattern: /^(bye|goodbye|good bye|see you|see ya|see you later|good night)$/,
    reply: 'Goodbye! Come back any time.'
  },
  {
    pattern: /^(who are you|what are you|what can you do|what do you do|how can you help|how can you help me|help)$/,
    reply: CAPABILITIES_REPLY
  }
];

// Strong employee/HR signals send the question straight to the employee path.
// Weaker hints ("I", "he", "here") are left to the general path, whose prompt
// hands anything about a person, the user or the workplace back to the employee
// path, so a miss there costs one extra AI call rather than a wrong answer.
const EMPLOYEE_SIGNAL =
  /\b(my|mine|myself|our|ours|employee|employees|staff|colleague|colleagues|team|teams|reportee|reportees|manager|managers|reporting|reports to|hr|human resources|attendance|absent|absence|absences|late days|punch|check-in|checkin|leave|leaves|time off|sick days|department|departments|designation|job title|role|salary|salaries|payroll|payslip|compensation|ctc|bonus|increment|appraisal|performance|rating|ratings|goal|goals|kpi|kpis|okr|okrs|skill|skills|training|learning|certification|tenure|joined|joining|date of joining|hired|resign|resigned|resignation|termination|terminated|exit interview|notice period|probation|confirmation|promotion|promoted|transfer|work location|shift|profile|insight|insights|timeline|evidence|employment|organisation|organization|headcount|workforce|zoho)\b/;

function normalize(question) {
  return String(question || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

class QuestionRouter {
  static get ROUTES() {
    return ROUTES;
  }

  /**
   * Returns { route, reply? }. `reply` is present only for the conversation route.
   */
  static classify(question) {
    const text = normalize(question);

    if (!text) {
      return { route: ROUTES.EMPLOYEE };
    }

    for (const { pattern, reply } of CONVERSATION_REPLIES) {
      if (pattern.test(text)) {
        return { route: ROUTES.CONVERSATION, reply };
      }
    }

    if (EMPLOYEE_SIGNAL.test(text)) {
      return { route: ROUTES.EMPLOYEE };
    }

    return { route: ROUTES.GENERAL };
  }
}

module.exports = QuestionRouter;
