'use strict';

const { HTTP_STATUS } = require('../config/constants');
const ApiResponse = require('../models/apiResponseModel');
const Logger = require('./logger');
const { AppError } = require('./errors');

class HttpUtils {
  static sendJson(res, statusCode, body, extraHeaders = {}) {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, x-employee-id',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders
    });
    res.end(JSON.stringify(body));
  }

  static sendSuccess(res, data, meta = {}, statusCode = HTTP_STATUS.OK) {
    const responsePayload = ApiResponse.success(data, meta);
    this.sendJson(res, statusCode, responsePayload);
  }

  static sendError(res, error) {
    // Only errors raised deliberately by this service (AppError) carry a
    // client-safe status, code and message. Anything else is reported generically.
    const isAppError = error instanceof AppError;
    const statusCode = isAppError && typeof error.statusCode === 'number'
      ? error.statusCode
      : HTTP_STATUS.INTERNAL_ERROR;
    const code = isAppError && error.code ? error.code : 'INTERNAL_ERROR';
    const message = isAppError && error.message ? error.message : 'An internal error occurred';

    if (statusCode >= 500) {
      Logger.error('Internal server error handled at HTTP boundary', error);
    } else {
      Logger.warn(`HTTP ${statusCode} client response`, { code, message });
    }

    const extraHeaders = {};
    if (statusCode === HTTP_STATUS.TOO_MANY_REQUESTS && Number.isFinite(error.retryAfterSeconds)) {
      extraHeaders['Retry-After'] = String(Math.ceil(error.retryAfterSeconds));
    }

    const responsePayload = ApiResponse.error(code, message);
    this.sendJson(res, statusCode, responsePayload, extraHeaders);
  }

  static async parseJsonBody(req, maxBytes = 1048576) {
    if (req.parsedBody !== undefined) {
      if (req.parsedBody && req.parsedBody._parseError) {
        throw req.parsedBody._parseError;
      }
      return req.parsedBody || {};
    }
    if (req.body && typeof req.body === 'object') {
      return req.body;
    }
    return new Promise((resolve, reject) => {
      let totalBytes = 0;
      const chunks = [];

      req.on('data', chunk => {
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) {
          reject(new Error('Request entity too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        if (chunks.length === 0) {
          resolve({});
          return;
        }
        const raw = Buffer.concat(chunks).toString('utf-8');
        try {
          const parsed = JSON.parse(raw);
          resolve(parsed);
        } catch (err) {
          reject(new Error('Malformed JSON payload'));
        }
      });

      req.on('error', err => {
        reject(err);
      });

      if (typeof req.resume === 'function') {
        req.resume();
      }
    });
  }
}

module.exports = HttpUtils;
