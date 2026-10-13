'use strict';

const VoiceService = require('../services/voiceService');
const RateLimiter = require('../utils/rateLimiter');
const Environment = require('../config/environment');
const HttpUtils = require('../utils/http');

/**
 * Voice chat endpoints. Both need the same sign-in as every other route, and
 * both are rate limited per user because each call spends Sarvam credit.
 * - POST /v1/voice/transcribe {audio: base64, mimeType, languageCode?}
 *   → {transcript, languageCode}
 * - POST /v1/voice/speak {text, languageCode} → {audio: base64 MP3, mimeType, languageCode}
 */
class VoiceController {
  constructor(service = VoiceService.shared()) {
    this.service = service;
  }

  async transcribe(req, res, params, context) {
    RateLimiter.consume('transcribe', RateLimiter.keyFor(context, req), Environment.getRateLimits().transcribe);
    const body = await HttpUtils.parseJsonBody(req);
    const result = await this.service.transcribe(body);
    HttpUtils.sendSuccess(res, result);
  }

  async speak(req, res, params, context) {
    const body = await HttpUtils.parseJsonBody(req);
    const payload = VoiceService.validateSpeech(body);
    // A cached clip costs no credit, so only new audio counts against the limit.
    if (!this.service.hasSpeech(payload)) {
      RateLimiter.consume('speak', RateLimiter.keyFor(context, req), Environment.getRateLimits().speak);
    }
    const result = await this.service.speak(payload);
    HttpUtils.sendSuccess(res, {
      audio: result.audioBase64,
      mimeType: result.mimeType,
      languageCode: result.languageCode,
      cached: result.cached
    });
  }
}

module.exports = VoiceController;
