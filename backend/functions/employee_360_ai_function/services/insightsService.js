'use strict';

const Employee360Service = require('./employee360Service');
const InsightGenerator = require('../ai/insightGenerator');

class InsightsService {
  constructor() {
    this.employee360Service = new Employee360Service();
    this.insightGenerator = new InsightGenerator();
  }

  async getEmployeeInsights(employeeId, context) {
    const canonical = await this.employee360Service.getCanonical360(employeeId, context, { persist: false });
    const insights = await this.insightGenerator.generateInsights(canonical);

    return {
      employeeId,
      insights,
      metricsSnapshot: canonical.deterministicMetrics,
      limitations: canonical.limitations
    };
  }
}

module.exports = InsightsService;
