'use strict';

const Employee360Service = require('./employee360Service');
const AskGenerator = require('../ai/askGenerator');
const AIInteractionRepository = require('../repositories/aiInteractionRepository');

class AskService {
  constructor() {
    this.employee360Service = new Employee360Service();
    this.askGenerator = new AskGenerator();
    this.aiInteractionRepository = new AIInteractionRepository();
  }

  async ask(employeeId, question, context) {
    const canonical = await this.employee360Service.getCanonical360(employeeId, context);
    const answerResult = await this.askGenerator.answerQuestion(canonical, question);

    // Audit AI interaction
    try {
      await this.aiInteractionRepository.logInteraction({
        employeeId,
        question,
        type: answerResult.type,
        confidence: answerResult.confidence,
        timestamp: new Date().toISOString()
      });
    } catch (logErr) {
      // Non-fatal
    }

    return answerResult;
  }
}

module.exports = AskService;
