'use strict';

const Employee360Service = require('../services/employee360Service');
const AuthorizationBoundary = require('../middleware/authorization');
const Validation = require('../utils/validation');
const HttpUtils = require('../utils/http');

class Employee360Controller {
  constructor() {
    this.service = new Employee360Service();
  }

  async handle(req, res, params, context) {
    const employeeId = Validation.validateEmployeeId(params.employeeId);
const canonical = await this.service.getCanonical360(employeeId, context);
    const filtered = canonical;

    HttpUtils.sendSuccess(res, filtered, { employeeId });
  }
}

module.exports = Employee360Controller;


