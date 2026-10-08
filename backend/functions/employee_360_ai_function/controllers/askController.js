'use strict';

const AskService = require('../services/askService');
const AuthorizationBoundary = require('../middleware/authorization');
const Validation = require('../utils/validation');
const HttpUtils = require('../utils/http');

class AskController {
  constructor() {
    this.service = new AskService();
  }

  async handle(req, res, params, context) {
    const employeeId = Validation.validateEmployeeId(params.employeeId);
    AuthorizationBoundary.authorizeEmployee(context, employeeId);
    const body = await HttpUtils.parseJsonBody(req);
    const { question, history } = Validation.validateAskPayload(body);

    const answerResponse = await this.service.ask(employeeId, question, context, history);
    HttpUtils.sendSuccess(res, answerResponse, { employeeId, question });
  }
}

module.exports = AskController;

