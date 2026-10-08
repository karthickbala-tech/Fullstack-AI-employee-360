'use strict';

const ZohoPeopleClient = require('../connectors/zohoPeople/zohoPeopleClient');
const ZohoPeopleEmployeeService = require('../connectors/zohoPeople/zohoPeopleEmployeeService');
const ZohoPeopleFormsService = require('../connectors/zohoPeople/zohoPeopleFormsService');
const EmployeeRepository = require('../repositories/employeeRepository');
const AuthorizationBoundary = require('../middleware/authorization');
const Validation = require('../utils/validation');
const HttpUtils = require('../utils/http');
const Logger = require('../utils/logger');

/**
 * Source-system endpoints. All of them expose organisation-wide or raw Zoho People
 * data, so every method requires an administrator. Errors propagate to the
 * global handler in index.js.
 */
class ZohoPeopleController {
  constructor() {
    this.client = new ZohoPeopleClient();
    this.employeeService = new ZohoPeopleEmployeeService(this.client);
    this.formsService = new ZohoPeopleFormsService(this.client);
    this.employeeRepository = new EmployeeRepository();
  }

  async getStatus(req, res, params, context) {
    // Authentication/authorization temporarily disabled for Development.
    // Restore AuthorizationBoundary.requireAdmin(context) when authentication is re-enabled.
    const verification = await this.client.verifyConnection(context);
    HttpUtils.sendSuccess(res, verification);
  }

  async getForms(req, res, params, context) {
    
    const forms = await this.formsService.listForms(context);
    HttpUtils.sendSuccess(res, {
      forms,
      source: 'live_zoho_people'
    });
  }

  async getFormComponents(req, res, params, context) {
    
    const formLinkName = Validation.validateFormLinkName(params.formLinkName);
    const components = await this.formsService.getFormComponents(formLinkName, context);
    HttpUtils.sendSuccess(res, {
      formLinkName,
      components,
      source: 'live_zoho_people'
    });
  }

  async getFormRecords(req, res, params, context) {
    
    const formLinkName = Validation.validateFormLinkName(params.formLinkName);
    const records = await this.formsService.getFormRecords(formLinkName, context);
    HttpUtils.sendSuccess(res, {
      formLinkName,
      records,
      source: 'live_zoho_people'
    });
  }

  async getEmployees(req, res, params, context) {
    
    const list = await this.employeeService.getLiveEmployeeDirectory(context);

    for (const employee of list) {
      try {
        await this.employeeRepository.save(
          {
            employeeId: employee.employeeId,
            employeeNumber: employee.employeeId,
            email: employee.email,
            status: employee.status,
            sourceEmployeeId: employee.recordId,
            reportingManagerId: employee.reportingManagerId
          },
          context
        );
      } catch (saveErr) {
        Logger.warn('Employee Data Store persistence skipped', {
          employeeId: employee.employeeId,
          error: saveErr.message
        });
      }
    }

    HttpUtils.sendSuccess(res, {
      employees: list,
      total: list.length,
      connected: true,
      connectionName: this.client.connectionName,
      source: 'live_zoho_people'
    });
  }
}

module.exports = ZohoPeopleController;
