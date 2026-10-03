'use strict';

const GeminiProvider = require('./geminiProvider');
const AIContextBuilder = require('./aiContextBuilder');
const AIGuardrails = require('./aiGuardrails');
const { DATA_CLASSIFICATION, CONFIDENCE_LEVELS } = require('../config/constants');
const Logger = require('../utils/logger');

class InsightGenerator {
  constructor(provider = null) {
    this.provider = provider || new GeminiProvider();
  }

  async generateInsights(canonical) {
    if (!canonical.isLiveZohoData) {
      return [];
    }

    const deterministicInsights = [];

    // Add deterministic metric evaluations
    if (canonical.deterministicMetrics?.tenure?.years >= 2) {
      deterministicInsights.push({
        domain: 'employment',
        type: DATA_CLASSIFICATION.CALCULATION,
        headline: 'Tenure Milestone',
        description: `Employee has completed ${canonical.deterministicMetrics.tenure.formatted} of service.`,
        confidence: CONFIDENCE_LEVELS.HIGH,
        evidence: [canonical.employment.dateOfJoining]
      });
    }

    if (canonical.trends && canonical.trends.length > 0) {
      canonical.trends.forEach(t => {
        deterministicInsights.push({
          domain: t.domain,
          type: DATA_CLASSIFICATION.TREND,
          headline: `Trend: ${t.metric}`,
          description: t.evidence,
          confidence: CONFIDENCE_LEVELS.MEDIUM,
          evidence: [t.evidence]
        });
      });
    }

    // Attempt AI synthesis for deeper qualitative patterns
    try {
      const contextStr = AIContextBuilder.buildPromptContext(canonical);
      const prompt = [
        AIGuardrails.getSystemPolicy(),
        "TASK: Provide 2 structured employee insights based only on provided facts.",
        "Output ONLY a JSON array with objects matching: [{\"domain\":\"performance\",\"headline\":\"...\",\"description\":\"...\"}]",
        "CONTEXT:",
        contextStr
      ].join('\n');

      const response = await this.provider.generateCompletion(prompt, { temperature: 0.1 });
      if (response) {
        const clean = response.replace(/^```json/g, '').replace(/```$/g, '').trim();
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) {
          parsed.forEach(item => {
            deterministicInsights.push({
              domain: item.domain || 'general',
              type: DATA_CLASSIFICATION.AI_INSIGHT,
              headline: item.headline,
              description: item.description,
              confidence: CONFIDENCE_LEVELS.MEDIUM,
              evidence: ['Synthesized from verified Employee 360 context']
            });
          });
        }
      }
    } catch (err) {
      Logger.warn('AI insight synthesis skipped or failed', { message: err.message });
    }

    return deterministicInsights;
  }
}

module.exports = InsightGenerator;
