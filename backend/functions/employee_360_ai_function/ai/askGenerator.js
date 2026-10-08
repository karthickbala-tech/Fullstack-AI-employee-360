'use strict';

const GeminiProvider = require('./geminiProvider');
const AIContextBuilder = require('./aiContextBuilder');
const AIGuardrails = require('./aiGuardrails');
const { DATA_CLASSIFICATION, CONFIDENCE_LEVELS } = require('../config/constants');
const Logger = require('../utils/logger');

class AskGenerator {
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

  async answerQuestion(canonical, question) {
    const cleanQuestion = AIGuardrails.sanitizePrompt(question);

    if (!canonical.isLiveZohoData) {
      return {
        answer: `Cannot answer "${cleanQuestion}": No live employee record was found in Zoho People for employee ID "${canonical.metadata?.employeeId || 'Unknown'}". Real-time data requires an active record in your Zoho People portal.`,
        type: DATA_CLASSIFICATION.UNKNOWN,
        confidence: CONFIDENCE_LEVELS.HIGH,
        evidence: [],
        limitations: canonical.limitations || ['No live Zoho People record retrieved.']
      };
    }

    const contextStr = AIContextBuilder.buildPromptContext(canonical);

    const prompt = [
      AIGuardrails.getSystemPolicy(),
      "QUESTION TO ANSWER:",
      cleanQuestion,
      "",
      "CONTEXT:",
      contextStr,
      "",
      "INSTRUCTIONS:",
      "1. Answer strictly using the context above.",
      "2. State 'Unknown' or 'Insufficient evidence' if the data is not present.",
      "3. Format your response strictly as JSON with this exact shape:",
      "{",
      '  "answer": "string",',
      '  "type": "Fact | Calculation | Trend | Correlation | AI Insight | Unknown",',
      '  "confidence": "high | medium | low | unknown",',
      '  "evidence": ["list of domain.field evidence references from the supplied evidence only"],',
      '  "limitations": ["list of limitations"]',
      "}",
      "4. For the 'type' field, use ONLY these exact values and capitalization:",
      "Fact",
      "Calculation",
      "Trend",
      "Correlation",
      "AI Insight",
      "Unknown",
      "5. Do not use lowercase or alternative values for the 'type' field.",
      "6. For the 'evidence' field, use ONLY exact domain.field references that exist in the supplied evidence array.",
      "7. Never invent, infer, or create evidence references that are not present in the supplied evidence array.",
      "8. Return JSON only. Do not wrap the JSON in markdown code fences."
    ].join('\n');

    try {
      const completion = await this.provider.generateCompletion(prompt, {
        temperature: 0.1
      });

      if (completion) {
        const clean = completion
          .replace(/^```json/g, '')
          .replace(/```$/g, '')
          .trim();

        const parsed = JSON.parse(clean);
        const validated = AIGuardrails.validateAskResponse(parsed);

        if (!validated) {
          throw new Error('Gemini returned an invalid Ask AI response structure');
        }

        if (
          !AskGenerator.validateEvidenceReferences(
            validated.evidence,
            canonical.evidence
          )
        ) {
          throw new Error('Gemini returned unsupported evidence references');
        }

        return validated;
      }
    } catch (err) {
      Logger.warn('AI Ask generator fallback triggered', {
        message: err.message
      });
    }

    return {
      answer: `Information for question "${cleanQuestion}" could not be confirmed with high confidence from current verified source records.`,
      type: DATA_CLASSIFICATION.UNKNOWN,
      confidence: CONFIDENCE_LEVELS.UNKNOWN,
      evidence: [],
      limitations:
        canonical.limitations.length > 0
          ? canonical.limitations
          : ['Source system integration incomplete or offline']
    };
  }
}

module.exports = AskGenerator;
