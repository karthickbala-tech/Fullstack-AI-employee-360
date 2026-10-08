'use strict';

const { UnauthorizedError, ForbiddenError } = require('../utils/errors');
const Environment = require('../config/environment');
const Logger = require('../utils/logger');

// Catalyst project role treated as tenant administrator (all employees).
// Catalyst's default administrator role; confirm against the project's role list.
const ADMIN_ROLE_NAMES = new Set(['App Administrator']);

// Value of `x-zc-user-type` when the Catalyst gateway (or `catalyst serve`) did not
// authenticate the caller as a project user and attached admin credentials instead.
const UNAUTHENTICATED_USER_TYPE = 'admin';

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
   * Establishes the calling user. Default is deny:
   * - no authenticated Catalyst project user -> 401
   * - user verified with userManagement().getCurrentUser() in strict user scope
   * - App Administrator -> scope 'all'
   * - any other user -> own employee record (matched by a unique Zoho People
   *   EmailID), plus direct reports (scope 'team') when the verified
   *   reportingManagerId relationship names them; otherwise scope 'self'.
   */
  static async authenticate(req, context) {
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
    if (!email) return;

    const directory = await this._getEmployeeService().getLiveEmployeeDirectory(context);
    const matches = directory.filter(entry => (entry.email || '').trim().toLowerCase() === email);

    if (matches.length !== 1) {
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
    context.user.allowedEmployeeIds = [ownId, ...reportees];
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
    return {
      authenticationEnabled: true,
      userId: user.userId,
      email: user.email,
      role: user.role,
      scope: user.scope,
      employeeId: user.employeeId,
      allowedEmployeeIds: user.scope === 'all' ? null : user.allowedEmployeeIds
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
