'use strict';

const Employee360Service = require('./employee360Service');
const SummaryGenerator = require('../ai/summaryGenerator');

class SummaryService {
  constructor() {
    this.employee360Service = new Employee360Service();
    this.summaryGenerator = new SummaryGenerator();
  }

  async getEmployeeSummary(employeeId, context) {
    const canonical = await this.employee360Service.getCanonical360(employeeId, context, { persist: false });
    const summaryResult = await this.summaryGenerator.generateSummary(canonical);

    return {
      employeeId,
      summary: summaryResult.summary,
      isAiGenerated: summaryResult.isAiGenerated,
      model: summaryResult.model,
      evidenceCount: canonical.evidence.length,
      limitations: canonical.limitations
    };
  }
}

module.exports = SummaryService;
