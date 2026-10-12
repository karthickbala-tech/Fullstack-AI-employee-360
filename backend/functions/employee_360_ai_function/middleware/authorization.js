'use strict';

const { UnauthorizedError, ForbiddenError } = require('../utils/errors');
const Environment = require('../config/environment');
const Logger = require('../utils/logger');
const { ERROR_CODES } = require('../config/constants');
const ZohoPeopleAssertion = require('./zohoPeopleAssertion');

// Catalyst project role treated as tenant administrator (all employees).
// Catalyst's default administrator role; confirm against the project's role list.
const ADMIN_ROLE_NAMES = new Set(['App Administrator']);

// Value of `x-zc-user-type` when the Catalyst gateway (or `catalyst serve`) did not
// authenticate the caller as a project user and attached admin credentials instead.
const UNAUTHENTICATED_USER_TYPE = 'admin';

// The Zoho Role field has not been verified in Zoho People directory records, so
// organizationAccess.zohoRoles is not consulted until this is set after a live check.
const ZOHO_ROLE_FIELD_VERIFIED = false;

// Field-permission domains and every canonical part derived from them, so a
// restricted domain disappears from data, metrics, trends and evidence alike.
const RESTRICTABLE_DOMAINS = {
  performance: { sections: ['performance', 'goals'], metrics: ['performanceRating'], evidence: ['performance', 'goals'] },
  leave: { sections: ['leave'], metrics: ['leaveUtilization'], evidence: ['leave'] },
  attendance: { sections: ['attendance'], metrics: ['attendancePercentage'], evidence: ['attendance'] }
};

class AuthorizationBoundary {
  static _getCatalyst() {
    return require('zcatalyst-sdk-node');
  }

  static _getEmployeeService() {
    const ZohoPeopleEmployeeService = require('../connectors/zohoPeople/zohoPeopleEmployeeService');
    return new ZohoPeopleEmployeeService();
  }

  /**
   * Establishes the calling user from exactly one identity source:
   * - a request carrying a Zoho People assertion (header or body, see
   *   takeCredentials) is authenticated only by that assertion; if it is
   *   invalid the request is rejected (401) and never falls back to Catalyst;
   * - any other request uses Catalyst authentication.
   */
  static async authenticate(req, context, credentials = this.takeCredentials(req)) {
    if (credentials.conflicting) {
      Logger.warn('Zoho People identity assertion rejected', { reason: 'sent_twice' });
      const err = new UnauthorizedError('Identity assertion could not be verified');
      err.code = ERROR_CODES.INVALID_IDENTITY_ASSERTION;
      throw err;
    }
    if (credentials.present) {
      return this._authenticateZohoPeople(credentials.token, context);
    }
    return this._authenticateCatalyst(req, context);
  }

  /**
   * Finds the Zoho People assertion in the request and removes it from the body.
   * Two transports, one token:
   * - the x-e360-assertion header (API clients that can send custom headers);
   * - the `e360Assertion` field of a JSON body (the Web Tab: a text/plain POST
   *   is a CORS "simple" request, so the browser sends no preflight, which the
   *   Catalyst gateway answers without CORS headers).
   * The token never travels in the URL. Sending it both ways is rejected. The
   * field is removed so no controller, validator or log ever sees it; index.js
   * calls this for every request, whether or not authentication is enabled.
   */
  static takeCredentials(req) {
    if (req && req.e360Credentials) return req.e360Credentials;

    const headers = (req && req.headers) || {};
    const inHeader = Object.prototype.hasOwnProperty.call(headers, ZohoPeopleAssertion.HEADER);
    const body = req ? req.parsedBody : undefined;
    const inBody = Boolean(body) && typeof body === 'object' && !Array.isArray(body) &&
      Object.prototype.hasOwnProperty.call(body, ZohoPeopleAssertion.BODY_FIELD);

    const bodyToken = inBody ? body[ZohoPeopleAssertion.BODY_FIELD] : undefined;
    if (inBody) delete body[ZohoPeopleAssertion.BODY_FIELD];

    const credentials = {
      present: inHeader || inBody,
      conflicting: inHeader && inBody,
      token: inHeader ? headers[ZohoPeopleAssertion.HEADER] : bodyToken
    };
    if (req) req.e360Credentials = credentials;
    return credentials;
  }

  /**
   * Zoho People Web Tab identity: a short-lived assertion signed by a Zoho People
   * function for the logged-in user. The tenant stays backend configuration (the
   * assertion must name the configured portal). The user then gets their own
   * employee record plus verified direct reports, and organization scope only
   * from the explicit organizationAccess policy.
   */
  static async _authenticateZohoPeople(token, context, now = undefined) {
    const tenant = Environment.getTenantConfig();
    let claims;
    try {
      claims = ZohoPeopleAssertion.verify(token, {
        secret: Environment.getIdentityAssertionSecret(),
        portalId: tenant.portalId,
        now
      });
    } catch (err) {
      Logger.warn('Zoho People identity assertion rejected', { reason: err.reason || 'invalid' });
      if (err instanceof UnauthorizedError) throw err;
      const wrapped = new UnauthorizedError('Identity assertion could not be verified');
      wrapped.code = ERROR_CODES.INVALID_IDENTITY_ASSERTION;
      throw wrapped;
    }

    await this._applyZohoPeopleUser(context, claims, tenant);
    return context;
  }

  /**
   * Builds the user for verified claims: own employee record plus verified
   * direct reports, and organization scope only from the explicit policy.
   * Shared by authentication and the development-only diagnostic so both
   * resolve access identically; the target object is whatever the caller passes.
   */
  static async _applyZohoPeopleUser(target, claims, tenant) {
    const email = claims.email.trim().toLowerCase();
    target.user = {
      userId: email,
      email,
      identitySource: 'zoho_people',
      catalystRole: null,
      role: 'employee',
      scope: 'self',
      employeeId: null,
      allowedEmployeeIds: []
    };

    await this._resolveEmployeeScope(target);

    if (this._hasOrganizationAccess(target.user, tenant.organizationAccess)) {
      target.user.role = 'admin';
      target.user.scope = 'all';
      target.user.organizationAccess = true;
    }
    return target;
  }

  /**
   * Development-only identity diagnostic for GET/POST /v1/me. Eligible only when
   * authentication is OFF, the server-side switch E360_IDENTITY_DIAGNOSTICS is
   * "enabled" (set in the Development console only), the request's
   * x-zc-environment header is absent or Development, and an assertion was sent.
   */
  static isIdentityDiagnosticEligible(req, credentials) {
    if (Environment.isAuthenticationEnabled()) return false;
    if (!Environment.isIdentityDiagnosticsEnabled()) return false;
    const environment = String(req?.headers?.['x-zc-environment'] || '').trim().toLowerCase();
    if (environment && environment !== 'development') return false;
    return Boolean(credentials && credentials.present);
  }

  /**
   * Classifies the configured secret by the verifier's own contract, first
   * match wins:
   * 1. missing / 2. too_short: the verifier rejects it (secret_not_configured);
   *    length is the raw length, whitespace included, exactly as the verifier counts;
   * 3. assertion_shaped: accepted by length, but the value (ignoring surrounding
   *    whitespace) parses as a signed Employee 360 assertion, a copy mistake;
   * 4. has_whitespace: accepted by length, but it contains whitespace (leading or
   *    trailing spaces, CR/LF, tabs, or only whitespace), usually a paste artefact,
   *    so it won't match the secret Zoho People signs with;
   * 5. ok: accepted by the verifier, with none of the above.
   * Only the label is returned; never the value or its length.
   */
  static _classifySecret(secret) {
    if (typeof secret !== 'string' || secret.length === 0) return 'missing';
    if (secret.length < ZohoPeopleAssertion.MIN_SECRET_LENGTH) return 'too_short';
    if (ZohoPeopleAssertion.isAssertionShaped(secret)) return 'assertion_shaped';
    if (/\s/.test(secret)) return 'has_whitespace';
    return 'ok';
  }

  /**
   * Verifies the request's assertion against the runtime secret with the real
   * verifier and resolves what authentication would grant, into a throw-away
   * object. It never sets context.user and never affects authorization. Returns
   * only labels, the asserting user's own email and a count of allowed employees.
   *
   * `context` is the request context: the employee lookup needs its `req` (the
   * Zoho People connection is reached through catalyst.initialize(req)). It is
   * only read, never written; the lookup runs on a separate diagnostic context.
   */
  static async diagnoseAssertion(credentials, context = null, now = undefined) {
    const tenant = Environment.getTenantConfig();
    const secret = Environment.getIdentityAssertionSecret();
    const result = { valid: false, reason: null, secretState: this._classifySecret(secret) };

    if (credentials.conflicting) {
      result.reason = 'sent_twice';
      return result;
    }

    let claims;
    try {
      claims = ZohoPeopleAssertion.verify(credentials.token, { secret, portalId: tenant.portalId, now });
    } catch (err) {
      result.reason = err.reason || 'invalid';
      Logger.info('Identity assertion diagnostic', { valid: false, reason: result.reason, secretState: result.secretState });
      return result;
    }

    const probe = this._diagnosticContext(context, tenant);
    try {
      await this._applyZohoPeopleUser(probe, claims, tenant);
    } catch (err) {
      Logger.warn('Identity assertion diagnostic could not read the employee directory', { secretState: result.secretState });
      return { ...result, valid: true, email: claims.email.trim().toLowerCase(), employeeMapping: 'lookup_failed' };
    }

    const user = probe.user;
    Logger.info('Identity assertion diagnostic', { valid: true, employeeMapping: user.employeeMapping || null });
    return {
      valid: true,
      reason: null,
      secretState: result.secretState,
      email: user.email,
      employeeMapping: user.employeeMapping || null,
      role: user.role,
      scope: user.scope,
      allowedEmployeeCount: user.scope === 'all' ? null : user.allowedEmployeeIds.length
    };
  }

  /**
   * A new context for the diagnostic's employee lookup: the same request and
   * tenant/portal/data-center values the connector reads, with no user. Only
   * named fields are copied, so the request context itself is never mutated.
   */
  static _diagnosticContext(context, tenant) {
    const source = context || {};
    return {
      req: source.req,
      requestId: source.requestId,
      tenantId: source.tenantId || tenant.tenantId,
      portalId: source.portalId || tenant.portalId,
      dataCenter: source.dataCenter || tenant.dataCenter,
      timestamp: source.timestamp,
      user: null
    };
  }

  /**
   * Explicit organization policy: the verified employee ID is listed, or (once
   * the Zoho Role field is verified in directory records) their Zoho Role is.
   * Nothing else grants organization scope.
   */
  static _hasOrganizationAccess(user, policy) {
    if (!user || !user.employeeId || !policy) return false;
    const employeeIds = Array.isArray(policy.employeeIds) ? policy.employeeIds : [];
    if (employeeIds.includes(user.employeeId)) return true;

    if (ZOHO_ROLE_FIELD_VERIFIED && user.zohoRole) {
      const zohoRoles = Array.isArray(policy.zohoRoles) ? policy.zohoRoles : [];
      return zohoRoles.includes(user.zohoRole);
    }
    return false;
  }

  /**
   * Catalyst identity. Default is deny:
   * - no authenticated Catalyst project user -> 401
   * - user verified with userManagement().getCurrentUser() in strict user scope
   * - App Administrator -> scope 'all'
   * - any other user -> own employee record (matched by a unique Zoho People
   *   EmailID), plus direct reports (scope 'team') when the verified
   *   reportingManagerId relationship names them; otherwise scope 'self'.
   */
  static async _authenticateCatalyst(req, context) {
    const userType = String(req.headers?.['x-zc-user-type'] || '').trim().toLowerCase();

    if (!userType || userType === UNAUTHENTICATED_USER_TYPE) {
      throw new UnauthorizedError('Authentication required');
    }

    let user;
    try {
      const app = this._getCatalyst().initialize(req, { scope: 'user' });
      user = await app.userManagement().getCurrentUser();
    } catch (err) {
      Logger.warn('Catalyst user verification failed', { error: err.message });
      throw new UnauthorizedError('Authentication could not be verified');
    }

    if (!user || user.user_id === undefined || user.user_id === null || user.user_id === '') {
      throw new UnauthorizedError('Authentication could not be verified');
    }

    const roleName = user.role_details?.role_name || null;
    const isAdmin = ADMIN_ROLE_NAMES.has(roleName);

    context.user = {
      userId: String(user.user_id),
      email: user.email_id || null,
      identitySource: 'catalyst',
      catalystRole: roleName,
      role: isAdmin ? 'admin' : 'employee',
      scope: isAdmin ? 'all' : 'self',
      employeeId: null,
      allowedEmployeeIds: []
    };

    if (!isAdmin) {
      await this._resolveEmployeeScope(context);
    }

    return context;
  }

  /**
   * Maps a non-admin user to exactly one employee record by email, then adds the
   * employees whose verified reportingManagerId is that record. No match or more
   * than one match grants no employee scope at all.
   */
  static async _resolveEmployeeScope(context) {
    const email = (context.user.email || '').trim().toLowerCase();
    context.user.employeeMapping = 'no_email';
    if (!email) return;

    const directory = await this._getEmployeeService().getLiveEmployeeDirectory(context);
    const matches = directory.filter(entry => (entry.email || '').trim().toLowerCase() === email);

    if (matches.length !== 1) {
      context.user.employeeMapping = matches.length > 1 ? 'ambiguous' : 'not_found';
      if (matches.length > 1) {
        Logger.warn('Authenticated user email matches more than one employee; no employee scope granted', {
          userId: context.user.userId,
          matches: matches.length
        });
      }
      return;
    }

    const ownId = matches[0].employeeId;
    const reportees = directory
      .filter(entry => entry.reportingManagerId === ownId && entry.employeeId !== ownId)
      .map(entry => entry.employeeId);

    context.user.employeeId = ownId;
    context.user.employeeMapping = 'matched';
    context.user.allowedEmployeeIds = [ownId, ...reportees];
    // Names for GET /v1/me, from the directory already loaded here.
    context.user.displayName = matches[0].fullName || null;
    context.user.allowedEmployees = context.user.allowedEmployeeIds.map(id => {
      const entry = directory.find(item => item.employeeId === id);
      return { employeeId: id, fullName: entry?.fullName || null };
    });
    context.user.hasDirectReports = reportees.length > 0;
    if (reportees.length > 0) {
      context.user.role = 'manager';
      context.user.scope = 'team';
    }
  }

  static requireAdmin(context) {
    if (!context || !context.user) {
      throw new UnauthorizedError('Authentication required');
    }
    if (context.user.role !== 'admin') {
      throw new ForbiddenError('Administrator access is required for this resource');
    }
    return true;
  }

  static enforceEmployeeScope(context, targetEmployeeId) {
    if (!context || !context.user) {
      throw new UnauthorizedError('User authentication context is missing');
    }
    const { role, scope, allowedEmployeeIds } = context.user;
    if (role === 'admin' && scope === 'all') {
      return true;
    }
    if (Array.isArray(allowedEmployeeIds) && allowedEmployeeIds.includes(targetEmployeeId)) {
      return true;
    }
    throw new ForbiddenError(`Access denied to employee profile ${targetEmployeeId}`);
  }

  /**
   * Route-level employee check. While authentication is disabled (Development
   * only) there is no user to check, so access stays as it is today; once it is
   * enabled, the scope check always applies.
   */
  static authorizeEmployee(context, targetEmployeeId) {
    if (!Environment.isAuthenticationEnabled()) return true;
    return this.enforceEmployeeScope(context, targetEmployeeId);
  }

  /** Route-level administrator check, with the same Development behaviour. */
  static authorizeAdmin(context) {
    if (!Environment.isAuthenticationEnabled()) return true;
    return this.requireAdmin(context);
  }

  /**
   * Scope summary for the caller, used by GET /v1/me. Development without
   * authentication reports itself explicitly rather than inventing a user.
   */
  static describeAccess(context) {
    if (!Environment.isAuthenticationEnabled()) {
      return { authenticationEnabled: false, role: 'development', scope: 'all', employeeId: null, allowedEmployeeIds: null };
    }
    const user = context?.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const organizationWide = user.scope === 'all';
    return {
      authenticationEnabled: true,
      authenticated: true,
      userId: user.userId,
      email: user.email,
      role: user.role,
      scope: user.scope,
      employeeId: user.employeeId,
      allowedEmployeeIds: organizationWide ? null : user.allowedEmployeeIds,
      identitySource: user.identitySource || null,
      // 'matched' | 'not_found' | 'ambiguous' | 'no_email'; null when not resolved (Catalyst admin).
      employeeMapping: user.employeeMapping || null,
      displayName: user.displayName || null,
      allowedEmployees: organizationWide ? null : (user.allowedEmployees || []),
      canAnalyzeTeam: user.hasDirectReports === true,
      // Organization analysis comes only from the explicit organizationAccess policy.
      canAnalyzeOrganization: user.organizationAccess === true
    };
  }

  /**
   * Removes every domain the tenant's field permissions mark 'none' from the
   * canonical data before it reaches any consumer or AI prompt: the section,
   * its deterministic metrics, its trends and its evidence.
   */
  static filterAllowedFields(context, canonicalData) {
    const permissions = Environment.getTenantConfig().fieldPermissions || {};
    const restricted = Object.keys(RESTRICTABLE_DOMAINS).filter(domain => permissions[domain] === 'none');
    if (restricted.length === 0) return canonicalData;

    const filtered = { ...canonicalData, deterministicMetrics: { ...(canonicalData.deterministicMetrics || {}) } };
    const blockedEvidence = new Set();

    for (const domain of restricted) {
      const { sections, metrics, evidence } = RESTRICTABLE_DOMAINS[domain];
      for (const section of sections) filtered[section] = { status: 'restricted' };
      for (const metric of metrics) {
        filtered.deterministicMetrics[metric] = { value: null, formatted: 'Restricted', classification: 'Unknown' };
      }
      evidence.forEach(item => blockedEvidence.add(item));
    }

    filtered.evidence = (canonicalData.evidence || []).filter(item => !blockedEvidence.has(item?.domain));
    filtered.trends = (canonicalData.trends || []).filter(item => !blockedEvidence.has(item?.domain));
    return filtered;
  }
}

module.exports = AuthorizationBoundary;
