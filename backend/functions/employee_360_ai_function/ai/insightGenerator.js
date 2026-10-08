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
  static validateEvidenceReferences(responseEvidence, canonicalEvidence) {
    if (!Array.isArray(responseEvidence) || !Array.isArray(canonicalEvidence)) {
      return false;
    }

    const allowedReferences = new Set(
      canonicalEvidence
        .filter(item => item && item.domain && item.field)
        .map(item => `${item.domain}.${item.field}`)
    );

    return responseEvidence.every(item => {
      if (typeof item !== 'string') return false;

      const reference = item.trim();
      if (!reference) return false;

      return allowedReferences.has(reference);
    });
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
        evidence: ['employment.tenure']
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
        "TASK: Provide 2 structured employee insights based only on provided facts and evidence.",
        "Each insight MUST include an evidence array containing only exact domain.field references from the supplied evidence array.",
        "Never invent, infer, or create evidence references that are not present in the supplied evidence array.",
        "Output ONLY a JSON array with objects matching: [{\"domain\":\"performance\",\"headline\":\"...\",\"description\":\"...\",\"evidence\":[\"domain.field\"]}]",
        "CONTEXT:",
        contextStr
      ].join('\n');

      const response = await this.provider.generateCompletion(prompt, { temperature: 0.1 });
      if (response) {
        const clean = response.replace(/^```json/g, '').replace(/```$/g, '').trim();
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) {
          parsed.forEach(item => {
            if (
              !InsightGenerator.validateEvidenceReferences(
                item.evidence,
                canonical.evidence
              )
            ) {
              throw new Error(
                'Gemini returned unsupported insight evidence references'
              );
            }

            deterministicInsights.push({
              domain: item.domain || 'general',
              type: DATA_CLASSIFICATION.AI_INSIGHT,
              headline: item.headline,
              description: item.description,
              confidence: CONFIDENCE_LEVELS.MEDIUM,
              evidence: item.evidence.map(reference => reference.trim())
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

