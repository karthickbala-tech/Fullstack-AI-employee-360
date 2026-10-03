'use strict';

const { ERROR_CODES } = require('./constants');
const { AppError } = require('../utils/errors');

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
      }
    };
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
