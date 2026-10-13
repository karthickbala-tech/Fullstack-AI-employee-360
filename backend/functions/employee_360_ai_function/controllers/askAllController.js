'use strict';

const GroupAskService = require('../services/groupAskService');
const VoiceService = require('../services/voiceService');
const AskGenerator = require('../ai/askGenerator');
const RateLimiter = require('../utils/rateLimiter');
const Environment = require('../config/environment');
const Validation = require('../utils/validation');
const HttpUtils = require('../utils/http');
const { DATA_CLASSIFICATION, CONFIDENCE_LEVELS } = require('../config/constants');

// The Web Tab waits up to 28 s for an answer. Translating an English reply back
// is skipped when the answer took this long, so the user gets the (accurate)
// English text instead of a timeout.
const LOCALIZE_DEADLINE_MS = 18000;

/**
 * POST /v1/ask: a chat question not tied to one selected employee. The body may
 * carry @/# mentions; GroupAskService authorizes every one against the caller's
 * scope before reading any data.
 *
 * Questions written in an Indian language are translated to English for
 * routing (one Sarvam call); the AI then answers in the asker's language, and
 * `language` in the response tells the client which voice to read it with.
 */
class AskAllController {
  constructor(service = new GroupAskService(), voice = VoiceService.shared()) {
    this.service = service;
    this.voice = voice;
  }

  /** Never an empty reply: anything without text becomes the no-data answer. */
  static ensureAnswer(result) {
    if (result && typeof result.answer === 'string' && result.answer.trim()) return result;
    return {
      ...(result || {}),
      answer: AskGenerator.NO_DATA_REPLY,
      type: DATA_CLASSIFICATION.UNKNOWN,
      confidence: CONFIDENCE_LEVELS.UNKNOWN,
      evidence: [],
      limitations: (result && result.limitations) || []
    };
  }

  async handle(req, res, params, context) {
    const startedAt = Date.now();
    RateLimiter.consume('ask', RateLimiter.keyFor(context, req), Environment.getRateLimits().ask);
    const body = await HttpUtils.parseJsonBody(req);
    const { question, history, mentions, language } = Validation.validateAskAllPayload(body);

    const prepared = await this.voice.prepareQuestion(question, language);
    if (prepared.language !== VoiceService.ENGLISH) {
      context.language = {
        code: prepared.language,
        name: VoiceService.languageName(prepared.language),
        originalQuestion: prepared.original
      };
    }

    const answer = AskAllController.ensureAnswer(await this.service.ask(prepared.question, context, history, mentions));
    const localized = Date.now() - startedAt < LOCALIZE_DEADLINE_MS || answer.localized
      ? await this.voice.localizeAnswer(answer, prepared.language)
      : { result: answer, language: VoiceService.ENGLISH };
    const { localized: _localized, ...result } = localized.result;
    HttpUtils.sendSuccess(res, { ...result, language: localized.language }, { question });
  }
}

module.exports = AskAllController;
