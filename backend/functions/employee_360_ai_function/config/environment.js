'use strict';

const { ERROR_CODES } = require('./constants');
const { AppError } = require('../utils/errors');

// Every non-public request must carry a verified identity: a Zoho People Web Tab
// assertion or a Catalyst session (see Environment.isAuthenticationEnabled).
// Enabled on Development 2026-10-12 after the Admin identity check passed.
const AUTHENTICATION_ENABLED = true;

class Environment {
  static getServiceConfig() {
    return {
      serviceName: 'AI Employee 360',
      version: '1.0.0',
      nodeEnv: process.env.NODE_ENV || 'development',
      port: process.env.X_ZOHO_CATALYST_LISTEN_PORT || 3000
    };
  }

  static getTenantConfig() {
    return {
      tenantId: 'vsk_hr_solution',
      tenantName: 'VSK HR Solution Private Limited',
      source: 'zoho_people',
      dataCenter: 'in',
      peopleBaseUrl: 'https://people.zoho.in',
      portalId: '60076299713',
      connectionName: 'zohopeople_employee360_v2',
      connectionLinkName: 'zohopeople_employee360_v2',
      enabledModules: [
        'employee',
        'attendance',
        'leave',
        'performance',
        'orgstructure'
      ],
      employeeAccessScope: {
        type: 'admin'
      },
      fieldPermissions: {
        employee: 'read',
        attendance: 'read',
        leave: 'read',
        performance: 'read',
        orgstructure: 'read'
      },
      // Explicit organization-wide access policy. Empty means nobody has it: it is
      // never inferred from Admin, Super Admin, CEO, designation or Catalyst role.
      // zohoRoles is inactive until the Zoho Role field is verified in the
      // directory records (see AuthorizationBoundary.ZOHO_ROLE_FIELD_VERIFIED).
      organizationAccess: {
        // OWN01: the portal administrator's own employee record (granted 2026-10-12).
        employeeIds: ['OWN01'],
        zohoRoles: []
      }
    };
  }

  /**
   * Shared secret that verifies Zoho People Web Tab identity assertions. Read
   * from the process environment only: no default, no .env file, never logged.
   * Missing means every assertion is rejected.
   */
  static getIdentityAssertionSecret() {
    const secret = process.env.E360_IDENTITY_ASSERTION_SECRET;
    return typeof secret === 'string' && secret.length > 0 ? secret : null;
  }

  /**
   * Development-only identity diagnostic on /v1/me. On only when the process
   * environment has E360_IDENTITY_DIAGNOSTICS=enabled (set in the Development
   * console only); anything else, including a missing variable, is off.
   */
  static isIdentityDiagnosticsEnabled() {
    return process.env.E360_IDENTITY_DIAGNOSTICS === 'enabled';
  }

  /**
   * Sarvam AI key for voice (speech-to-text, text-to-speech) and translation.
   * Read from the function environment only; it is never sent to the browser.
   * Both spellings are accepted (the Development config uses "Sarvam_API_KEY").
   */
  static getSarvamApiKey() {
    const key = process.env.SARVAM_API_KEY || process.env.Sarvam_API_KEY || '';
    return key.trim() || null;
  }

  /**
   * How long one function instance reuses the Zoho People employee directory
   * (every authenticated request needs it). Short, so status or reporting
   * changes show within a minute. 0 turns the cache off.
   */
  static getDirectoryCacheTtlMs() {
    return 60 * 1000;
  }

  /**
   * Per-user request limits for one function instance, as [max, windowMs].
   * They protect the free-tier Sarvam and Gemini quotas from runaway clients
   * (stuck buttons, retry loops); normal use stays far below them.
   */
  static getRateLimits() {
    return {
      ask: [30, 60 * 1000],
      transcribe: [12, 60 * 1000],
      speak: [15, 60 * 1000]
    };
  }

  /**
   * Whether requests must come from an authenticated Catalyst project user.
   * Disabled only for Development Web Tab testing, where every request behaves as
   * unrestricted. MUST be true before any production deployment; when true, every
   * non-public route enforces the caller's role and employee scope.
   */
  static isAuthenticationEnabled() {
    return AUTHENTICATION_ENABLED;
  }

  static getGeminiApiKey() {
    let key = process.env.GEMINI_API_KEY;
    if (!key || key === 'MY_GEMINI_API_KEY') {
      try {
        const fs = require('fs');
        const path = require('path');
        const envPaths = [
          path.resolve(__dirname, '../../../.env'),
          path.resolve(__dirname, '../../.env'),
          path.resolve(process.cwd(), '.env'),
          '/app/applet/.env'
        ];
        for (const p of envPaths) {
          if (fs.existsSync(p)) {
            const content = fs.readFileSync(p, 'utf-8');
            const match = content.match(/GEMINI_API_KEY=(.+)/);
            if (match && match[1].trim() && match[1].trim() !== 'MY_GEMINI_API_KEY') {
              key = match[1].trim().replace(/^['"]|['"]$/g, '');
              process.env.GEMINI_API_KEY = key;
              break;
            }
          }
        }
      } catch (e) {
        // Ignore read errors
      }
    }
    if (!key || typeof key !== 'string' || key.trim() === '' || key.trim() === 'MY_GEMINI_API_KEY') {
      return null;
    }
    return key.trim();
  }

  static assertGeminiConfigured() {
    const key = this.getGeminiApiKey();
    if (!key) {
      throw new AppError(
        'Gemini AI provider is not configured. GEMINI_API_KEY environment variable is missing.',
        ERROR_CODES.CONFIGURATION_ERROR,
        503
      );
    }
    return key;
  }
}

module.exports = Environment;
