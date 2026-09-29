'use strict';

const ZohoPeopleClient = require('../connectors/zohoPeople/zohoPeopleClient');
const ZohoPeopleEmployeeService = require('../connectors/zohoPeople/zohoPeopleEmployeeService');
const HttpUtils = require('../utils/http');
const Logger = require('../utils/logger');

class ZohoPeopleController {
  constructor() {
    this.client = new ZohoPeopleClient();
    this.employeeService = new ZohoPeopleEmployeeService(this.client);
  }

  async getStatus(req, res, params, context) {
    const verification = await this.client.verifyConnection(context);
    HttpUtils.sendSuccess(res, verification);
  }

  async getEmployees(req, res, params, context) {
    try {
      const list = await this.employeeService.getLiveEmployeeDirectory(context);
      HttpUtils.sendSuccess(res, {
        employees: list,
        total: list.length,
        connected: true,
        connectionName: this.client.connectionName,
        source: 'live_zoho_people'
      });
    } catch (err) {
      Logger.warn('Failed to retrieve live employee directory from Zoho People', { error: err.message });
      HttpUtils.sendError(res, err);
    }
  }
}

module.exports = ZohoPeopleController;
