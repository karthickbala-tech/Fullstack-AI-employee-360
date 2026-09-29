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
      "3. Format your response strictly as JSON with this shape:",
      "{",
      '  "answer": "string",',
      '  "type": "fact | calculation | trend | correlation | ai_insight | unknown",',
      '  "confidence": "high | medium | low | unknown",',
      '  "evidence": ["list of strings mentioning the source fields"],',
      '  "limitations": ["list of limitations"]',
      "}"
    ].join('\n');

    try {
      const completion = await this.provider.generateCompletion(prompt, { temperature: 0.1 });
      if (completion) {
        const clean = completion.replace(/^```json/g, '').replace(/```$/g, '').trim();
        const parsed = JSON.parse(clean);
        return {
          answer: parsed.answer || 'No answer generated.',
          type: parsed.type || DATA_CLASSIFICATION.AI_INSIGHT,
          confidence: parsed.confidence || CONFIDENCE_LEVELS.MEDIUM,
          evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
          limitations: Array.isArray(parsed.limitations) ? parsed.limitations : canonical.limitations
        };
      }
    } catch (err) {
      Logger.warn('AI Ask generator fallback triggered', { message: err.message });
    }

    return {
      answer: `Information for question "${cleanQuestion}" could not be confirmed with high confidence from current verified source records.`,
      type: DATA_CLASSIFICATION.UNKNOWN,
      confidence: CONFIDENCE_LEVELS.UNKNOWN,
      evidence: [],
      limitations: canonical.limitations.length > 0 ? canonical.limitations : ['Source system integration incomplete or offline']
    };
  }
}

module.exports = AskGenerator;
