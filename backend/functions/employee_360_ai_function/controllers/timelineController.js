'use strict';

const TimelineService = require('../services/timelineService');
const AuthorizationBoundary = require('../middleware/authorization');
const Validation = require('../utils/validation');
const HttpUtils = require('../utils/http');

class TimelineController {
  constructor() {
    this.service = new TimelineService();
  }

  async handle(req, res, params, context) {
    const employeeId = Validation.validateEmployeeId(params.employeeId);
const data = await this.service.getEmployeeTimeline(employeeId, context);
    HttpUtils.sendSuccess(res, data, { employeeId });
  }
}

module.exports = TimelineController;

