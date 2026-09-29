'use strict';

const AIProvider = require('./aiProvider');
const Environment = require('../config/environment');
const { AIProviderError } = require('../utils/errors');
const Logger = require('../utils/logger');

// Prioritize high-availability current models
const CANDIDATE_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash'
];

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
        maxOutputTokens: options.maxOutputTokens || 1024
      }
    };

    const modelsToTry = [this.model, ...CANDIDATE_MODELS.filter(m => m !== this.model)];
    let lastError = null;

    for (const modelName of modelsToTry) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
            'User-Agent': 'aistudio-build'
          },
          body: JSON.stringify(requestPayload)
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          Logger.warn(`Gemini API returned status ${response.status} for model ${modelName}: ${errBody.slice(0, 150)}`);
          lastError = new AIProviderError(`Gemini service error: HTTP ${response.status} on ${modelName}`);
          continue; // Attempt fallback candidate model
        }

        const result = await response.json();
        const candidate = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!candidate) {
          throw new AIProviderError(`Gemini model ${modelName} returned an empty candidate`);
        }

        this.model = modelName;
        return candidate.trim();
      } catch (err) {
        lastError = err;
        Logger.warn(`Gemini model ${modelName} attempt error:`, { message: err.message });
      }
    }

    if (lastError instanceof AIProviderError) throw lastError;
    throw new AIProviderError('Failed to communicate with Gemini API across candidate models', { message: lastError?.message });
  }
}

module.exports = GeminiProvider;
