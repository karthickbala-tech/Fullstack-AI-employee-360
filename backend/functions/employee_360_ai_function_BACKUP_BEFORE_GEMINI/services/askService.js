'use strict';

const crypto = require('crypto');
const Employee360Service = require('./employee360Service');
const AskGenerator = require('../ai/askGenerator');
const AIInteractionRepository = require('../repositories/aiInteractionRepository');
const Logger = require('../utils/logger');

class AskService {
  constructor() {
    this.employee360Service = new Employee360Service();
    this.askGenerator = new AskGenerator();
    this.aiInteractionRepository = new AIInteractionRepository();
  }

  async ask(employeeId, question, context) {
    const canonical = await this.employee360Service.getCanonical360(
      employeeId,
      context
    );

    const answerResult = await this.askGenerator.answerQuestion(
      canonical,
      question
    );

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
          model: this.askGenerator.provider?.model || null,
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

    return answerResult;
  }
}

module.exports = AskService;