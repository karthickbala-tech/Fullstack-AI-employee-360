'use strict';

const Environment = require('../../config/environment');
const { AppError, ExternalServiceError, RateLimitError } = require('../../utils/errors');
const { ERROR_CODES } = require('../../config/constants');
const Logger = require('../../utils/logger');

const BASE_URL = 'https://api.sarvam.ai';

// Models checked against the Sarvam API on 2026-10-13.
const STT_MODEL = 'saaras:v3';
const TTS_MODEL = 'bulbul:v3';
const TRANSLATE_MODEL = 'mayura:v1';

const STT_TIMEOUT_MS = 15000;
const TTS_TIMEOUT_MS = 15000;
const TRANSLATE_TIMEOUT_MS = 5000;

/**
 * Thin Sarvam AI REST client: one HTTP call per method, no automatic retries
 * (a retry would spend free-tier credit twice). The subscription key stays in
 * this process; only status codes and sizes are ever logged, never content.
 */
class SarvamClient {
  constructor(fetchImpl = (...args) => fetch(...args)) {
    this.fetch = fetchImpl;
  }

  static isConfigured() {
    return Boolean(Environment.getSarvamApiKey());
  }

  _key() {
    const key = Environment.getSarvamApiKey();
    if (!key) {
      throw new AppError('Voice and translation are not configured on this server.', ERROR_CODES.CONFIGURATION_ERROR, 503);
    }
    return key;
  }

  async _call(path, init, timeoutMs, operation) {
    const startedAt = Date.now();
    let response;
    try {
      response = await this.fetch(`${BASE_URL}${path}`, {
        ...init,
        headers: { ...(init.headers || {}), 'api-subscription-key': this._key() },
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      Logger.warn('Sarvam request failed', { operation, timedOut, ms: Date.now() - startedAt });
      throw new ExternalServiceError(timedOut ? 'The voice service took too long. Please try again.' : 'The voice service could not be reached.');
    }

    let body = null;
    try {
      body = await response.json();
    } catch (err) {
      body = null;
    }
    Logger.info('Sarvam request', { operation, status: response.status, ms: Date.now() - startedAt });

    if (response.ok && body && typeof body === 'object') return body;
    if (response.status === 429) {
      const retryAfter = Number(response.headers?.get?.('retry-after'));
      throw new RateLimitError('The voice service is busy (usage limit reached). Please try again shortly.', Number.isFinite(retryAfter) ? retryAfter : 30);
    }
    if (response.status === 401 || response.status === 403) {
      throw new AppError('Voice and translation are not available right now.', ERROR_CODES.CONFIGURATION_ERROR, 503);
    }
    if (response.status === 400 || response.status === 422) {
      throw new ExternalServiceError('The voice service could not process that input.');
    }
    throw new ExternalServiceError('The voice service returned an error. Please try again.');
  }

  /**
   * Speech to text. `languageCode` "unknown" lets Sarvam detect the language.
   * @returns {{transcript: string, languageCode: string|null, languageProbability: number|null}}
   */
  async transcribe(audio, mimeType, fileName, languageCode = 'unknown') {
    const form = new FormData();
    form.append('file', new Blob([audio], { type: mimeType }), fileName);
    form.append('model', STT_MODEL);
    form.append('language_code', languageCode);
    const body = await this._call('/speech-to-text', { method: 'POST', body: form }, STT_TIMEOUT_MS, 'transcribe');
    return {
      transcript: typeof body.transcript === 'string' ? body.transcript : '',
      languageCode: typeof body.language_code === 'string' ? body.language_code : null,
      languageProbability: Number.isFinite(body.language_probability) ? body.language_probability : null
    };
  }

  /** Text to speech as one base64 MP3. */
  async speak(text, languageCode) {
    const body = await this._call('/text-to-speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        target_language_code: languageCode,
        language_code: languageCode,
        model: TTS_MODEL,
        output_audio_codec: 'mp3',
        speech_sample_rate: 22050,
        pace: 1.05
      })
    }, TTS_TIMEOUT_MS, 'speak');
    const audio = Array.isArray(body.audios) ? body.audios.filter(item => typeof item === 'string' && item) : [];
    if (audio.length === 0) throw new ExternalServiceError('The voice service returned no audio.');
    // Several clips are whole MP3 streams; their bytes concatenate, their base64 strings do not.
    const audioBase64 = audio.length === 1 ? audio[0] : Buffer.concat(audio.map(item => Buffer.from(item, 'base64'))).toString('base64');
    return { audioBase64, mimeType: 'audio/mpeg' };
  }

  /** Translation; `source` may be "auto". */
  async translate(input, source, target) {
    const body = await this._call('/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input,
        source_language_code: source,
        target_language_code: target,
        model: TRANSLATE_MODEL,
        mode: 'formal'
      })
    }, TRANSLATE_TIMEOUT_MS, 'translate');
    return {
      text: typeof body.translated_text === 'string' ? body.translated_text : '',
      sourceLanguageCode: typeof body.source_language_code === 'string' ? body.source_language_code : source
    };
  }
}

SarvamClient.MODELS = { STT_MODEL, TTS_MODEL, TRANSLATE_MODEL };

module.exports = SarvamClient;
