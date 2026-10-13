'use strict';

const GeminiProvider = require('./geminiProvider');
const AIContextBuilder = require('./aiContextBuilder');
const AIGuardrails = require('./aiGuardrails');
const AskGenerator = require('./askGenerator');
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

    const insights = [];
    // Every insight, deterministic or AI, must cite evidence that exists for this employee.
    const grounded = references =>
      Array.isArray(references) &&
      references.length > 0 &&
      InsightGenerator.validateEvidenceReferences(references, canonical.evidence);

    // Add deterministic metric evaluations
    if (canonical.deterministicMetrics?.tenure?.years >= 2 && grounded(['employment.tenure'])) {
      insights.push({
        domain: 'employment',
        type: DATA_CLASSIFICATION.CALCULATION,
        headline: 'Tenure Milestone',
        description: `Employee has completed ${canonical.deterministicMetrics.tenure.formatted} of service.`,
        confidence: CONFIDENCE_LEVELS.HIGH,
        evidence: ['employment.tenure']
      });
    }

    for (const t of canonical.trends || []) {
      if (!grounded(t.evidenceRefs)) {
        Logger.warn('Trend insight skipped: no supporting evidence', { domain: t.domain, metric: t.metric });
        continue;
      }
      insights.push({
        domain: t.domain,
        type: DATA_CLASSIFICATION.TREND,
        headline: `Trend: ${t.metric}`,
        description: t.evidence,
        confidence: CONFIDENCE_LEVELS.MEDIUM,
        evidence: [...t.evidenceRefs]
      });
    }

    // Attempt AI synthesis for deeper qualitative patterns
    try {
      const systemInstruction = [
        AIGuardrails.getSystemPolicy(),
        '',
        'TASK: Provide up to 2 structured employee insights based only on the supplied facts and evidence.',
        'Respond with a JSON array of objects: [{"domain": string, "headline": string, "description": string, "evidence": [domain.field strings]}].',
        'Each insight MUST cite at least one exact domain.field reference from the supplied evidence array. Never invent references.',
        'If the context does not support a meaningful insight, return an empty array.'
      ].join('\n');

      const response = await this.provider.generateCompletion(
        `CONTEXT:\n${AIContextBuilder.buildPromptContext(canonical)}`,
        { temperature: 0.1, systemInstruction, responseMimeType: 'application/json' }
      );
      if (response) {
        const parsed = AskGenerator.parseJson(response);
        if (Array.isArray(parsed)) {
          // One unsupported reference rejects the whole AI batch (fail closed).
          for (const item of parsed) {
            if (!grounded(item?.evidence)) {
              throw new Error('Gemini returned unsupported insight evidence references');
            }
          }
          for (const item of parsed) {
            insights.push({
              domain: item.domain || 'general',
              type: DATA_CLASSIFICATION.AI_INSIGHT,
              headline: item.headline,
              description: item.description,
              confidence: CONFIDENCE_LEVELS.MEDIUM,
              evidence: item.evidence.map(reference => reference.trim())
            });
          }
        }
      }
    } catch (err) {
      Logger.warn('AI insight synthesis skipped or failed', { message: err.message });
    }

    return insights;
  }
}

module.exports = InsightGenerator;

