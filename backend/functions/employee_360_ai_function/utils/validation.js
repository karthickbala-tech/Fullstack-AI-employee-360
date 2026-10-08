'use strict';

const { ValidationError } = require('./errors');

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
      question: cleanQuestion
    };
  }
}

module.exports = Validation;
