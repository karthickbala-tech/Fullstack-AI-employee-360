'use strict';

const ZohoPeopleClient = require('../connectors/zohoPeople/zohoPeopleClient');
const ZohoPeopleEmployeeService = require('../connectors/zohoPeople/zohoPeopleEmployeeService');
const HttpUtils = require('../utils/http');
const Logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class ZohoPeopleController {
  constructor() {
    this.client = new ZohoPeopleClient();
    this.employeeService = new ZohoPeopleEmployeeService(this.client);
  }

  async getStatus(req, res, params, context) {
    const token = context.zohoToken || process.env.ZOHO_PEOPLE_AUTH_TOKEN || null;
    const dataCenter = context.dataCenter || 'in';

    if (!token) {
      HttpUtils.sendSuccess(res, {
        connected: false,
        organizationName: 'VSK HR Solution Private Limited',
        portalId: '60076299713',
        dataCenter,
        message: 'No live Zoho People OAuth token configured. Live data queries will be paused until connected.'
      });
      return;
    }

    const verification = await this.client.verifyConnection(token, dataCenter);
    HttpUtils.sendSuccess(res, verification);
  }

  async getEmployees(req, res, params, context) {
    const token = context.zohoToken || process.env.ZOHO_PEOPLE_AUTH_TOKEN || null;

    if (!token) {
      HttpUtils.sendSuccess(res, {
        employees: [],
        connected: false,
        message: 'Zoho People token required to fetch live employee directory.'
      });
      return;
    }

    try {
      const list = await this.employeeService.getLiveEmployeeDirectory(context);
      HttpUtils.sendSuccess(res, {
        employees: list,
        total: list.length,
        connected: true,
        source: 'live_zoho_people'
      });
    } catch (err) {
      Logger.warn('Failed to retrieve live employee directory from Zoho People', { error: err.message });
      HttpUtils.sendError(res, err);
    }
  }

  async configure(req, res, params, context) {
    const body = await HttpUtils.parseJsonBody(req);
    const token = (body.token || '').trim();
    const dataCenter = (body.dataCenter || 'in').toLowerCase();

    if (!token) {
      HttpUtils.sendSuccess(res, {
        connected: false,
        message: 'Token cannot be empty'
      });
      return;
    }

    const verification = await this.client.verifyConnection(token, dataCenter);
    if (verification.connected) {
      process.env.ZOHO_PEOPLE_AUTH_TOKEN = token;
      try {
        const envFile = path.resolve(process.cwd(), '.env');
        let content = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf-8') : '';
        if (content.includes('ZOHO_PEOPLE_AUTH_TOKEN=')) {
          content = content.replace(/ZOHO_PEOPLE_AUTH_TOKEN=.*/g, `ZOHO_PEOPLE_AUTH_TOKEN=${token}`);
        } else {
          content += `\nZOHO_PEOPLE_AUTH_TOKEN=${token}\n`;
        }
        fs.writeFileSync(envFile, content);
      } catch (e) {
        // Non-fatal
      }
    }

    HttpUtils.sendSuccess(res, verification);
  }
}

module.exports = ZohoPeopleController;
