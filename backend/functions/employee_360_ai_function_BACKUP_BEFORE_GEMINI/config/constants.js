'use strict';

const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503
};

const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR',
  DATA_STORE_ERROR: 'DATA_STORE_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
};

const DATA_CLASSIFICATION = {
  FACT: 'Fact',
  CALCULATION: 'Calculation',
  TREND: 'Trend',
  CORRELATION: 'Correlation',
  AI_INSIGHT: 'AI Insight',
  UNKNOWN: 'Unknown'
};

const CONFIDENCE_LEVELS = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  UNKNOWN: 'unknown'
};

const CANONICAL_DOMAINS = [
  'employee',
  'employment',
  'organisation',
  'attendance',
  'leave',
  'performance',
  'goals',
  'skills',
  'learning',
  'career',
  'lifecycle',
  'timeline',
  'evidence'
];

const DATASTORE_TABLE_IDS = {
  Tenants: '67649000000039401',
  Employees: '67649000000034020',
  Employee360: '67649000000032012',
  Evidence: '67649000000033012',
  TimelineEvents: '67649000000032371',
  SchemaRegistry: '67649000000035024',
  FieldMappings: '67649000000042055',
  SyncState: '67649000000044010',
  AIInteractions: '67649000000034379'
};

const RESERVED_COLUMN_MAP = {
  Employee360: {
    employee: 'employeeProfile',
    employment: 'employmentInfo',
    organisation: 'organisationInfo',
    leave: 'leaveInfo',
    goals: 'goalsInfo',
    skills: 'skillsInfo',
    learning: 'learningInfo',
    career: 'careerInfo',
    lifecycle: 'lifecycleInfo',
    timeline: 'timelineInfo',
    evidence: 'evidenceInfo'
  },
  SyncState: {
    module: 'zohoModule',
    cursor: 'cursorState',
    error: 'errorInfo'
  }
};

module.exports = {
  HTTP_STATUS,
  ERROR_CODES,
  DATA_CLASSIFICATION,
  CONFIDENCE_LEVELS,
  CANONICAL_DOMAINS,
  DATASTORE_TABLE_IDS,
  RESERVED_COLUMN_MAP
};
