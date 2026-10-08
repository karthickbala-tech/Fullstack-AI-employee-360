'use strict';

const crypto = require('crypto');
const Employee360Service = require('./employee360Service');
const AskGenerator = require('../ai/askGenerator');
const QuestionRouter = require('../ai/questionRouter');
const DeterministicAnswers = require('../ai/deterministicAnswers');
const AIInteractionRepository = require('../repositories/aiInteractionRepository');
const { DATA_CLASSIFICATION, CONFIDENCE_LEVELS } = require('../config/constants');
const Logger = require('../utils/logger');

const { ROUTES } = QuestionRouter;

class AskService {
  constructor() {
    this.employee360Service = new Employee360Service();
    this.askGenerator = new AskGenerator();
    this.aiInteractionRepository = new AIInteractionRepository();
  }

  async ask(employeeId, question, context) {
    const classified = QuestionRouter.classify(question);
    const { reply } = classified;
    // An exact profile question belongs to the employee path even when it has
    // no strong HR keyword ("when did I join?"), so it never costs a general AI call.
    const route = classified.route === ROUTES.GENERAL && DeterministicAnswers.match(question)
      ? ROUTES.EMPLOYEE
      : classified.route;

    // Greetings and small talk: no employee data, no AI call, nothing to audit.
    if (route === ROUTES.CONVERSATION) {
      Logger.info('Ask answered on the conversation fast path', { employeeId });
      return {
        answer: reply,
        type: DATA_CLASSIFICATION.UNKNOWN,
        confidence: CONFIDENCE_LEVELS.UNKNOWN,
        evidence: [],
        limitations: [],
        route
      };
    }

    // General questions: answered without any Employee 360 context, unless the
    // model hands the question back to the employee path.
    if (route === ROUTES.GENERAL) {
      const generalResult = await this.askGenerator.answerGeneral(question);
      if (generalResult) {
        Logger.info('Ask answered on the general path', { employeeId });
        await this._audit(employeeId, question, generalResult, context);
        return { ...generalResult, route };
      }
      Logger.info('General path handed the question to the employee path', { employeeId });
    }

    const canonical = await this.employee360Service.getCanonical360(
      employeeId,
      context
    );

    // Exact profile questions are answered from the canonical model with no AI call.
    const deterministicResult = DeterministicAnswers.answer(question, canonical);
    if (deterministicResult) {
      Logger.info('Ask answered deterministically from Employee 360 data', { employeeId });
      await this._audit(employeeId, question, deterministicResult, context, null);
      return { ...deterministicResult, route: ROUTES.DETERMINISTIC };
    }

    const answerResult = await this.askGenerator.answerQuestion(
      canonical,
      question
    );

    await this._audit(employeeId, question, answerResult, context);

    return { ...answerResult, route: ROUTES.EMPLOYEE };
  }

  async _audit(employeeId, question, answerResult, context, model = this.askGenerator.provider?.model || null) {
    try {
      await this.aiInteractionRepository.logInteraction(
        {
          interactionId: crypto.randomUUID(),
          tenantId: context?.tenantId || 'vsk_hr_solution',
          employeeId,
          userId: context?.user?.userId || 'unknown-user',
          question,
          answer: answerResult.answer,
          confidence: answerResult.confidence,
          evidence: answerResult.evidence || [],
          model,
          createdAt: new Date()
        },
        context
      );
    } catch (logErr) {
      Logger.warn('AI interaction audit persistence failed', {
        employeeId,
        error: logErr.message
      });
    }
  }
}

module.exports = AskService;
