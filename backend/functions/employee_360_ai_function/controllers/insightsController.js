'use strict';

const InsightsService = require('../services/insightsService');
const AuthorizationBoundary = require('../middleware/authorization');
const Validation = require('../utils/validation');
const HttpUtils = require('../utils/http');

class InsightsController {
  constructor() {
    this.service = new InsightsService();
  }

  async handle(req, res, params, context) {
    const employeeId = Validation.validateEmployeeId(params.employeeId);
    AuthorizationBoundary.authorizeEmployee(context, employeeId);
    const data = await this.service.getEmployeeInsights(employeeId, context);
    HttpUtils.sendSuccess(res, data, { employeeId });
  }
}

module.exports = InsightsController;

