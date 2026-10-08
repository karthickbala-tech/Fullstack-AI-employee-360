'use strict';

const { ValidationError } = require('./errors');

// Ask conversation history: accepted request size vs. the bounded window used.
const ASK_HISTORY_MAX_ACCEPTED = 50;
const ASK_HISTORY_TURNS_USED = 6;
const ASK_HISTORY_TURN_MAX_CHARS = 1000;

class Validation {
  static sanitizeString(input) {
    if (typeof input !== 'string') return '';
    return input.trim();
  }

  static validateEmployeeId(employeeId) {
    if (!employeeId || typeof employeeId !== 'string') {
      throw new ValidationError('Employee ID must be a non-empty string');
    }
    const cleanId = employeeId.trim();
    if (cleanId.length === 0) {
      throw new ValidationError('Employee ID cannot be blank');
    }
    if (cleanId.length > 64) {
      throw new ValidationError('Employee ID exceeds maximum allowable length of 64 characters');
    }
    const safeRegex = /^[a-zA-Z0-9_-]+$/;
    if (!safeRegex.test(cleanId)) {
      throw new ValidationError('Employee ID contains invalid characters. Only alphanumeric, dashes, and underscores are allowed.');
    }
    return cleanId;
  }

  static validateFormLinkName(formLinkName) {
    const clean = typeof formLinkName === 'string' ? formLinkName.trim() : '';
    if (!/^[A-Za-z0-9_]{1,100}$/.test(clean)) {
      throw new ValidationError('formLinkName must contain only letters, digits and underscores (max 100)');
    }
    return clean;
  }

  static validateAskPayload(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ValidationError('Request body must be a valid JSON object');
    }
    const { question } = body;
    if (!question || typeof question !== 'string') {
      throw new ValidationError("Property 'question' is required and must be a string");
    }
    const cleanQuestion = question.trim();
    if (cleanQuestion.length === 0) {
      throw new ValidationError("Property 'question' cannot be empty");
    }
    if (cleanQuestion.length > 500) {
      throw new ValidationError("Question exceeds maximum permitted length of 500 characters");
    }
    return {
      question: cleanQuestion,
      history: Validation.validateAskHistory(body.history)
    };
  }

  /**
   * Optional prior turns of the conversation. Only the most recent turns are kept,
   * each trimmed to a bounded length. History is untrusted text used to resolve
   * references in the current question; it never carries data or permissions.
   */
  static validateAskHistory(history) {
    if (history === undefined || history === null) return [];
    if (!Array.isArray(history)) {
      throw new ValidationError("Property 'history' must be an array of { role, content } turns");
    }
    if (history.length > ASK_HISTORY_MAX_ACCEPTED) {
      throw new ValidationError(`Property 'history' may contain at most ${ASK_HISTORY_MAX_ACCEPTED} turns`);
    }

    const turns = history.map((turn, index) => {
      if (!turn || typeof turn !== 'object' || Array.isArray(turn)) {
        throw new ValidationError(`history[${index}] must be an object`);
      }
      if (turn.role !== 'user' && turn.role !== 'assistant') {
        throw new ValidationError(`history[${index}].role must be 'user' or 'assistant'`);
      }
      if (typeof turn.content !== 'string') {
        throw new ValidationError(`history[${index}].content must be a string`);
      }
      return { role: turn.role, content: turn.content.trim().slice(0, ASK_HISTORY_TURN_MAX_CHARS) };
    });

    return turns.filter(turn => turn.content.length > 0).slice(-ASK_HISTORY_TURNS_USED);
  }
}

module.exports = Validation;
