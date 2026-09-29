'use strict';

const { ERROR_CODES, HTTP_STATUS } = require('../config/constants');

class AppError extends Error {
  constructor(message, code = ERROR_CODES.INTERNAL_ERROR, statusCode = HTTP_STATUS.INTERNAL_ERROR, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, ERROR_CODES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST, details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, ERROR_CODES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden to requested resource') {
    super(message, ERROR_CODES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Requested resource not found') {
    super(message, ERROR_CODES.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }
}

class ExternalServiceError extends AppError {
  constructor(message = 'External service communication failed', details = null) {
    super(message, ERROR_CODES.EXTERNAL_SERVICE_ERROR, HTTP_STATUS.BAD_GATEWAY, details);
  }
}

class AIProviderError extends AppError {
  constructor(message = 'AI provider failed to generate a response', details = null) {
    super(message, ERROR_CODES.AI_PROVIDER_ERROR, HTTP_STATUS.BAD_GATEWAY, details);
  }
}

class DataStoreError extends AppError {
  constructor(message = 'Data store operation failed', details = null) {
    super(message, ERROR_CODES.DATA_STORE_ERROR, HTTP_STATUS.INTERNAL_ERROR, details);
  }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ExternalServiceError,
  AIProviderError,
  DataStoreError
};
