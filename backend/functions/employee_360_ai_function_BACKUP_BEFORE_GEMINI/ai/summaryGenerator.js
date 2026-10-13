'use strict';

const AIGuardrails = require('./aiGuardrails');
const AIContextBuilder = require('./aiContextBuilder');
const GeminiProvider = require('./geminiProvider');
const Logger = require('../utils/logger');

class SummaryGenerator {
  constructor(provider = null) {
    this.provider = provider || new GeminiProvider();
  }

  async generateSummary(canonical) {
    if (!canonical.isLiveZohoData) {
      return {
        summary: `No live employee record was retrieved from Zoho People for ID "${canonical.metadata?.employeeId || 'Unknown'}". Real-time data synchronization requires an active record in your Zoho People portal and a working Catalyst Connection. Please enter a valid Zoho People employee ID or verify the Zoho People connection configuration.`,        isAiGenerated: false,
        model: null
      };
    }

    const contextStr = AIContextBuilder.buildPromptContext(canonical);
    const systemPolicy = AIGuardrails.getSystemPolicy();

    const prompt = [
      systemPolicy,
      "STRICT MANDATE: Generate a concise, objective 3-paragraph executive summary using ONLY the verified real-time Zoho People data provided in the context.",
      "NEVER fabricate, assume, or invent roles, departments, locations, or ratings not explicitly present.",
      "PARAGRAPH 1: Profile, role, department, tenure, and verified work location as recorded in Zoho People.",
      "PARAGRAPH 2: Documented performance, verified metrics, attendance and evidenced strengths.",
      "PARAGRAPH 3: Development areas and explicitly state any missing or unprovided data in the Zoho People record.",
      "",
      "REAL-TIME ZOHO PEOPLE CONTEXT DATA:",
      contextStr
    ].join('\n');

    try {
      const completion = await this.provider.generateCompletion(prompt, { temperature: 0.2 });
      if (completion) {
        return {
          summary: completion,
          isAiGenerated: true,
          model: this.provider.model
        };
      }
    } catch (err) {
      Logger.warn('AI summary generation failed; fallback to deterministic summary', { message: err.message });
    }

    // Deterministic factual summary directly from real Zoho People fields
    const empName = canonical.employee.fullName || canonical.metadata.employeeId;
    const role = canonical.employment.jobTitle || 'Role unassigned in Zoho People';
    const dept = canonical.organisation.department || 'Department unassigned in Zoho People';
    const tenure = canonical.deterministicMetrics?.tenure?.formatted || 'Tenure unrecorded';
    const location = canonical.employment.workLocation ? `at ${canonical.employment.workLocation}` : '';

    return {
      summary: `${empName} is recorded in Zoho People as ${role} in ${dept} ${location}. Documented tenure is ${tenure}. All metrics and details originate from verified real-time Zoho People records.`.trim(),
      isAiGenerated: false,
      model: null
    };
  }
}

module.exports = SummaryGenerator;
