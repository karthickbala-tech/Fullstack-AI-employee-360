'use strict';

const AskService = require('../services/askService');
const AuthorizationBoundary = require('../middleware/authorization');
const Validation = require('../utils/validation');
const HttpUtils = require('../utils/http');
const RateLimiter = require('../utils/rateLimiter');
const AskAllController = require('./askAllController');
const Environment = require('../config/environment');

class AskController {
  constructor() {
    this.service = new AskService();
  }

  async handle(req, res, params, context) {
    RateLimiter.consume('ask', RateLimiter.keyFor(context, req), Environment.getRateLimits().ask);
    const employeeId = Validation.validateEmployeeId(params.employeeId);
    AuthorizationBoundary.authorizeEmployee(context, employeeId);
    const body = await HttpUtils.parseJsonBody(req);
    const { question, history } = Validation.validateAskPayload(body);

    const { localized, ...answerResponse } = AskAllController.ensureAnswer(await this.service.ask(employeeId, question, context, history));
    HttpUtils.sendSuccess(res, answerResponse, { employeeId, question });
  }
}

module.exports = AskController;

