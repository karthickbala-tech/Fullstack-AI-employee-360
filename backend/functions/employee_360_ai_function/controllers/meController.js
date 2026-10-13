'use strict';

const AuthorizationBoundary = require('../middleware/authorization');
const HttpUtils = require('../utils/http');

/**
 * GET /v1/me: the caller's role and employee scope, so a client can show only
 * what the backend will allow. The backend still enforces every request itself.
 *
 * In Development with authentication off and the diagnostic switch on, a request
 * that carries an assertion also gets `assertionCheck` (see
 * AuthorizationBoundary.diagnoseAssertion). Otherwise the response is unchanged.
 */
class MeController {
  async handle(req, res, params, context) {
    const access = AuthorizationBoundary.describeAccess(context);
    const credentials = req.e360Credentials;
    if (!AuthorizationBoundary.isIdentityDiagnosticEligible(req, credentials)) {
      HttpUtils.sendSuccess(res, access);
      return;
    }
    const assertionCheck = await AuthorizationBoundary.diagnoseAssertion(credentials, context);
    HttpUtils.sendSuccess(res, { ...access, assertionCheck });
  }
}

module.exports = MeController;
