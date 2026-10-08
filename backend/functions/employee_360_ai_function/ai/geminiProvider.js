'use strict';

const AIProvider = require('./aiProvider');
const Environment = require('../config/environment');
const { AIProviderError } = require('../utils/errors');
const Logger = require('../utils/logger');

// Prioritize high-availability current models
const CANDIDATE_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite'
];

// Total time allowed for Gemini across all candidate models in one request. Catalyst
// terminates the function at its execution limit (observed: HTTP 408 EXECUTION_TIME_EXCEEDED
// after ~30s) and the frontend aborts at 20s, so an unbounded Gemini call turns the whole
// request into an error instead of the deterministic fallback the generators already provide.
const GEMINI_TIME_BUDGET_MS = 15000;

class GeminiProvider extends AIProvider {
  constructor(model = null) {
    super();
    this.model = model || CANDIDATE_MODELS[0];
  }

  async generateCompletion(prompt, options = {}) {
    const apiKey = Environment.getGeminiApiKey();
    if (!apiKey) {
      Logger.warn('Gemini API key is not configured in environment; AI generation bypassed');
      return null;
    }

    const requestPayload = {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: options.temperature !== undefined ? options.temperature : 0.2,
        maxOutputTokens: options.maxOutputTokens || 1024,
        ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {})
      },
      // Rules travel separately from user-supplied text, so the question and
      // conversation cannot pose as instructions.
      ...(options.systemInstruction
        ? { systemInstruction: { parts: [{ text: options.systemInstruction }] } }
        : {})
    };

    const modelsToTry = [this.model, ...CANDIDATE_MODELS.filter(m => m !== this.model)];
    let lastError = null;
    const deadline = Date.now() + (options.timeBudgetMs || GEMINI_TIME_BUDGET_MS);

    for (const modelName of modelsToTry) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        Logger.warn('Gemini time budget exhausted; skipping remaining candidate models', { model: modelName });
        break;
      }

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
            'User-Agent': 'aistudio-build'
          },
          body: JSON.stringify(requestPayload),
          signal: AbortSignal.timeout(remainingMs)
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          Logger.warn(`Gemini API returned status ${response.status} for model ${modelName}: ${errBody.slice(0, 150)}`);
          lastError = new AIProviderError(`Gemini service error: HTTP ${response.status} on ${modelName}`);
          continue; // Attempt fallback candidate model
        }

        const result = await response.json();

        // DIAGNOSTIC (temporary): one line per billed Gemini call so Catalyst logs show
        // real call frequency and token usage. No prompt/response content is logged.
        Logger.info('DIAGNOSTIC Gemini call completed', {
          model: modelName,
          finishReason: result.candidates?.[0]?.finishReason || null,
          usage: result.usageMetadata || null
        });

        const candidate = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!candidate) {
          throw new AIProviderError(`Gemini model ${modelName} returned an empty candidate`);
        }

        this.model = modelName;
        return candidate.trim();
      } catch (err) {
        lastError = err;
        Logger.warn(`Gemini model ${modelName} attempt error:`, {
          message: err.message,
          timedOut: err.name === 'TimeoutError'
        });
      }
    }

    if (lastError instanceof AIProviderError) throw lastError;
    throw new AIProviderError('Failed to communicate with Gemini API across candidate models', { message: lastError?.message });
  }
}

module.exports = GeminiProvider;
