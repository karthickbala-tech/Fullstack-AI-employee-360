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
   * - App Administrator -> scope 'all'; any other user -> scope 'self'
   *   (own employee record, matched by a unique Zoho People EmailID).
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
      employeeId: null
    };

    if (!isAdmin) {
      context.user.employeeId = await this._resolveOwnEmployeeId(context);
    }

    return context;
  }

  /**
   * Maps a non-admin user to exactly one employee record by email.
   * No match or more than one match grants no employee scope.
   */
  static async _resolveOwnEmployeeId(context) {
    const email = context.user.email;
    if (!email) return null;

    const matches = await this._getEmployeeService().findEmployeesByEmail(email, context);

    if (matches.length === 1) {
      return matches[0].employeeId;
    }

    if (matches.length > 1) {
      Logger.warn('Authenticated user email matches more than one employee; no employee scope granted', {
        userId: context.user.userId,
        matches: matches.length
      });
    }

    return null;
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
    const { role, scope, employeeId } = context.user;
    if (role === 'admin' && scope === 'all') {
      return true;
    }
    if (scope === 'self' && employeeId && employeeId === targetEmployeeId) {
      return true;
    }
    throw new ForbiddenError(`Access denied to employee profile ${targetEmployeeId}`);
  }

  static filterAllowedFields(context, canonicalData) {
    const tenantConfig = Environment.getTenantConfig();
    const permissions = tenantConfig.fieldPermissions;

    const filtered = { ...canonicalData };
    if (permissions.performance === 'none') {
      filtered.performance = { status: 'restricted' };
      filtered.goals = { status: 'restricted' };
    }
    if (permissions.leave === 'none') {
      filtered.leave = { status: 'restricted' };
    }
    if (permissions.attendance === 'none') {
      filtered.attendance = { status: 'restricted' };
    }
    return filtered;
  }
}

module.exports = AuthorizationBoundary;
