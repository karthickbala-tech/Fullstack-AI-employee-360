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
  DETERMINISTIC: 'deterministic',
  // Organization-level question answered from the directory without AI (set by AskService).
  ORGANIZATION: 'organization'
});

const CAPABILITIES_REPLY =
  "I'm the Employee 360 assistant. I can answer questions about this employee's verified " +
  'Zoho People record, such as role, department, tenure, attendance, leave and lifecycle events, ' +
  "and I'll say clearly when something isn't recorded.";

// Each pattern must match from the start of the normalized message. What follows
// the phrase may only be a short trailer (see SMALL_TALK_TRAILER) when the entry
// allows it, so "hi, what is my attendance?" is never mistaken for a greeting.
const CONVERSATION_REPLIES = [
  {
    pattern: /^(hey there|hi there|hello there|good (morning|afternoon|evening)|hello|hiya|hey|hi|greetings|namaste|vanakkam)( team| all| everyone)?/,
    allowTrailer: true,
    reply: 'Hi! How can I help you today?'
  },
  {
    pattern: /^(how are you doing|how are you|how is it going|how's it going|hows it going|how do you do)/,
    allowTrailer: true,
    reply: "I'm doing well, thanks for asking. What would you like to know?"
  },
  {
    pattern: /^(thank you so much|thank you|thanks a lot|thanks so much|many thanks|thanks|ty|cheers)/,
    allowTrailer: true,
    reply: "You're welcome! Let me know if there's anything else."
  },
  {
    pattern: /^(ok|okay|cool|great|nice|got it|alright|all right|sure|perfect|awesome)$/,
    reply: 'Glad that helps. Anything else you would like to check?'
  },
  {
    pattern: /^(see you later|good night|good bye|goodbye|see you|see ya|bye)/,
    allowTrailer: true,
    reply: 'Goodbye! Come back any time.'
  },
  {
    pattern: /^(who are you|what are you|what can you do|what do you do|how can you help|how can you help me|help)$/,
    reply: CAPABILITIES_REPLY
  }
];

// Up to two extra words after a small-talk phrase ("how are you maple",
// "thanks a lot, maple") still count, unless they carry an employee/HR signal.
const SMALL_TALK_TRAILER = /^( [a-z']+){0,2}$/;

// Strong employee/HR signals send the question straight to the employee path.
// Weaker hints ("I", "he", "here") are left to the general path, whose prompt
// hands anything about a person, the user or the workplace back to the employee
// path, so a miss there costs one extra AI call rather than a wrong answer.
const EMPLOYEE_SIGNAL =
  /\b(my|mine|myself|our|ours|employee|employees|staff|colleague|colleagues|team|teams|reportee|reportees|manager|managers|reporting|reports to|hr|human resources|attendance|absent|absence|absences|late days|punch|check-in|checkin|leave|leaves|time off|sick days|department|departments|designation|job title|role|salary|salaries|payroll|payslip|compensation|ctc|bonus|increment|appraisal|performance|rating|ratings|goal|goals|kpi|kpis|okr|okrs|skill|skills|training|learning|certification|tenure|joined|joining|date of joining|hired|resign|resigned|resignation|termination|terminated|exit interview|notice period|probation|confirmation|promotion|promoted|transfer|work location|shift|profile|insight|insights|timeline|evidence|employment|organisation|organization|headcount|workforce|zoho)\b/;

// Short continuations that lean on the previous question for their subject.
const FOLLOW_UP = /^((what|how) about|and|also|same (for|with)|what of|(last|this|next|previous) (month|week|year|quarter))\b/;

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
   * Whether the question is an elliptical follow-up ("what about last month?",
   * "and her manager?") that only makes sense with the previous turn.
   */
  static isFollowUp(question) {
    return FOLLOW_UP.test(normalize(question));
  }

  /**
   * Returns { route, reply? }. `reply` is present only for the conversation route.
   */
  static classify(question) {
    const text = normalize(question);

    if (!text) {
      return { route: ROUTES.EMPLOYEE };
    }

    for (const { pattern, reply, allowTrailer } of CONVERSATION_REPLIES) {
      const match = text.match(pattern);
      if (!match) continue;
      const trailer = text.slice(match[0].length);
      const smallTalk = trailer === '' ||
        (allowTrailer && SMALL_TALK_TRAILER.test(trailer) && !EMPLOYEE_SIGNAL.test(trailer));
      if (smallTalk) {
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
