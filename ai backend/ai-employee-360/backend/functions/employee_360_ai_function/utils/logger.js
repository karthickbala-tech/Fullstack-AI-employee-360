'use strict';

const SENSITIVE_KEYS = [
  'authorization',
  'api_key',
  'apikey',
  'gemini_api_key',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'secret',
  'password'
];

function sanitize(data) {
  if (data === null || data === undefined) {
    return data;
  }
  if (typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitize(item));
  }
  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
      clean[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      clean[key] = sanitize(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

class Logger {
  static info(message, meta = {}) {
    const payload = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message,
      meta: sanitize(meta)
    };
    process.stdout.write(JSON.stringify(payload) + '\n');
  }

  static warn(message, meta = {}) {
    const payload = {
      timestamp: new Date().toISOString(),
      level: 'WARN',
      message,
      meta: sanitize(meta)
    };
    process.stdout.write(JSON.stringify(payload) + '\n');
  }

  static error(message, error = null, meta = {}) {
    const payload = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message,
      error: error
        ? {
            name: error.name,
            code: error.code || 'UNKNOWN',
            message: error.message
          }
        : null,
      meta: sanitize(meta)
    };
    process.stderr.write(JSON.stringify(payload) + '\n');
  }
}

module.exports = Logger;
