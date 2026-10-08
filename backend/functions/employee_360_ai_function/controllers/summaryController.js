'use strict';

const SummaryService = require('../services/summaryService');
const AuthorizationBoundary = require('../middleware/authorization');
const Validation = require('../utils/validation');
const HttpUtils = require('../utils/http');

class SummaryController {
  constructor() {
    this.service = new SummaryService();
  }

  async handle(req, res, params, context) {
    const employeeId = Validation.validateEmployeeId(params.employeeId);
    AuthorizationBoundary.authorizeEmployee(context, employeeId);
    const data = await this.service.getEmployeeSummary(employeeId, context);
    HttpUtils.sendSuccess(res, data, { employeeId });
  }
}

module.exports = SummaryController;

