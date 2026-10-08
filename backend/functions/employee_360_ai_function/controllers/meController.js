'use strict';

const AuthorizationBoundary = require('../middleware/authorization');
const HttpUtils = require('../utils/http');

/**
 * GET /v1/me: the caller's role and employee scope, so a client can show only
 * what the backend will allow. The backend still enforces every request itself.
 */
class MeController {
  async handle(req, res, params, context) {
    HttpUtils.sendSuccess(res, AuthorizationBoundary.describeAccess(context));
  }
}

module.exports = MeController;
