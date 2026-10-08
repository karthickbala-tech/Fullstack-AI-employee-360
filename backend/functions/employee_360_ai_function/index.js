'use strict';

const RequestContext = require('./middleware/requestContext');
const AuthorizationBoundary = require('./middleware/authorization');
const Router = require('./routes/index');
const HttpUtils = require('./utils/http');
const { ValidationError } = require('./utils/errors');

/**
 * Zoho Catalyst Advanced I/O Entry Point
 * Signature: module.exports = async (req, res)
 */
module.exports = async (req, res) => {
  // Handle CORS preflight options request
  if ((req.method || '').toUpperCase() === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, x-employee-id',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  const context = RequestContext.create(req);

  try {
    // Early stream capture for POST / PUT / PATCH to prevent stream loss
    if (['POST', 'PUT', 'PATCH'].includes((req.method || '').toUpperCase())) {
      try {
        req.parsedBody = await HttpUtils.parseJsonBody(req);
      } catch (err) {
        throw new ValidationError(err.message || 'Malformed JSON payload');
      }
    }

    // Authentication temporarily disabled for Development.
    // Restore AuthorizationBoundary.authenticate() when authentication is re-enabled.

    // 2. Delegate routing to route table
    await Router.dispatch(req, res, context);
  } catch (err) {
    // Centralized error handling across all layers
    HttpUtils.sendError(res, err);
  }
};


