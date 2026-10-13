'use strict';

const Environment = require('../config/environment');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');

const normalize = value => String(value || '').trim().toLowerCase();

/**
 * What a caller may ask about in the chat: the employees and departments inside
 * their authorized scope, built from the same verified data as every other route.
 *
 * - Organization access (explicit organizationAccess policy): every employee.
 * - Otherwise: the caller's allowedEmployeeIds (self + verified direct reports).
 * - Development with authentication off: unrestricted, as every route is today,
 *   and there is no signed-in "self".
 *
 * Departments are those of the people in scope, so a manager's departments are
 * their own and their team's, and a department question never reaches beyond scope.
 */
class AccessScope {
  /**
   * @param {object} context request context (context.user set by authentication)
   * @param {Function} loadDirectory async () => live directory, used only when
   *   authentication has not already loaded it for this request
   */
  static async forRequest(context, loadDirectory) {
    const authenticationEnabled = Environment.isAuthenticationEnabled();
    const user = context?.user || null;
    if (authenticationEnabled && !user) throw new UnauthorizedError('Authentication required');

    const directory = Array.isArray(context?.directory) ? context.directory : await loadDirectory();

    if (!authenticationEnabled) {
      return AccessScope._build(directory, { organizationWide: true, viewerEmployeeId: null, hasTeam: true });
    }
    return AccessScope._fromUser(user, directory);
  }

  /** Scope from an authenticated user and an already-loaded directory (no I/O). */
  static _fromUser(user, directory) {
    const organizationWide = user.organizationAccess === true;
    return AccessScope._build(directory, {
      organizationWide,
      viewerEmployeeId: user.employeeId || null,
      hasTeam: user.hasDirectReports === true,
      allowed: organizationWide ? null : new Set(user.allowedEmployeeIds || [])
    });
  }

  static _build(directory, { organizationWide, viewerEmployeeId, hasTeam, allowed = null }) {
    const entries = (directory || []).filter(entry =>
      entry && entry.employeeId && (organizationWide || (allowed !== null && allowed.has(entry.employeeId)))
    );
    const departments = [...new Set(entries.map(entry => String(entry.department || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    return {
      organizationWide,
      viewerEmployeeId,
      allScope: organizationWide ? 'organization' : hasTeam ? 'team' : 'self',
      entries,
      allowedIds: new Set(entries.map(entry => entry.employeeId)),
      departments
    };
  }

  /** The lists the chat offers for @ and #: only people and departments in scope. */
  static mentionable(scope) {
    return {
      employees: scope.entries.map(entry => ({
        employeeId: entry.employeeId,
        fullName: entry.fullName || null,
        department: entry.department || null
      })),
      departments: scope.departments,
      canMentionAll: scope.allScope !== 'self',
      allScope: scope.allScope
    };
  }

  /**
   * Every mention must be inside scope; anything else is refused before any data
   * is read. Returns the mentions with departments in their canonical spelling.
   */
  static authorizeMentions(scope, mentions) {
    for (const employeeId of mentions.employeeIds) {
      if (!scope.allowedIds.has(employeeId)) {
        throw new ForbiddenError(`Access denied to employee profile ${employeeId}`);
      }
    }
    const byKey = new Map(scope.departments.map(department => [normalize(department), department]));
    const departments = mentions.departments.map(department => {
      const match = byKey.get(normalize(department));
      if (!match) throw new ForbiddenError('Access denied to the requested department');
      return match;
    });
    if (mentions.all && scope.allScope === 'self') {
      throw new ForbiddenError('Organization and team questions are outside your access');
    }
    return { employeeIds: mentions.employeeIds, departments, all: mentions.all === true };
  }

  /**
   * People a group question covers, always a subset of scope: everyone in scope
   * for @all or no mention; otherwise the mentioned people plus everyone in the
   * mentioned departments.
   */
  static members(scope, mentions) {
    const hasNarrowing = mentions.employeeIds.length > 0 || mentions.departments.length > 0;
    if (mentions.all || !hasNarrowing) return scope.entries;
    const ids = new Set(mentions.employeeIds);
    const departments = new Set(mentions.departments.map(normalize));
    return scope.entries.filter(entry => ids.has(entry.employeeId) || departments.has(normalize(entry.department)));
  }

  /** A short phrase for answers: "the organization", "your team", "Human Resources", ... */
  static label(scope, mentions) {
    if (mentions.departments.length === 1 && mentions.employeeIds.length === 0) return mentions.departments[0];
    if (mentions.departments.length > 1 && mentions.employeeIds.length === 0) return mentions.departments.join(' and ');
    if (mentions.employeeIds.length > 0) return 'the selected employees';
    return scope.allScope === 'organization' ? 'the organization' : scope.allScope === 'team' ? 'your team' : 'your record';
  }
}

module.exports = AccessScope;
