'use strict';

const crypto = require('crypto');
const SarvamClient = require('../connectors/sarvam/sarvamClient');
const { ValidationError } = require('../utils/errors');
const Logger = require('../utils/logger');

const ENGLISH = 'en-IN';

// Languages Sarvam can speak (and translate), by BCP-47 code.
const LANGUAGES = {
  'en-IN': 'English',
  'hi-IN': 'Hindi',
  'bn-IN': 'Bengali',
  'gu-IN': 'Gujarati',
  'kn-IN': 'Kannada',
  'ml-IN': 'Malayalam',
  'mr-IN': 'Marathi',
  'od-IN': 'Odia',
  'pa-IN': 'Punjabi',
  'ta-IN': 'Tamil',
  'te-IN': 'Telugu'
};

// Unicode blocks of the Indic scripts, mapped to the most likely language.
// Devanagari is also Marathi; the translator's own detection settles that.
const SCRIPTS = [
  [/[ऀ-ॿ]/, 'hi-IN'],
  [/[ঀ-৿]/, 'bn-IN'],
  [/[਀-੿]/, 'pa-IN'],
  [/[઀-૿]/, 'gu-IN'],
  [/[଀-୿]/, 'od-IN'],
  [/[஀-௿]/, 'ta-IN'],
  [/[ఀ-౿]/, 'te-IN'],
  [/[ಀ-೿]/, 'kn-IN'],
  [/[ഀ-ൿ]/, 'ml-IN']
];

// Machine translation of HR questions sometimes picks a general word; these
// put the HR term back so routing and field selection still work.
const HR_GLOSSARY = [
  [/\bpresence\b/gi, 'attendance'],
  [/\bholidays? taken\b/gi, 'leave taken'],
  [/\bsalary slip\b/gi, 'salary']
];

// Audio limits: Sarvam's REST speech-to-text is for clips under 30 s, and the
// request body (base64) must stay under the 1 MB parser limit.
const MAX_AUDIO_BYTES = 640 * 1024;
const MIN_AUDIO_BYTES = 1024;
const AUDIO_TYPES = {
  'audio/webm': 'speech.webm',
  'audio/ogg': 'speech.ogg',
  'audio/mp4': 'speech.m4a',
  'audio/mpeg': 'speech.mp3',
  'audio/wav': 'speech.wav',
  'audio/x-wav': 'speech.wav',
  'audio/aac': 'speech.aac'
};

// Spoken replies are capped: long answers are cut at a sentence end, which
// keeps each text-to-speech call small (credit is charged per character).
const SPEAK_MAX_CHARS = 500;
const TRANSLATE_CHUNK_CHARS = 950;
const TRANSLATE_MAX_CHUNKS = 3;

class LruCache {
  constructor(limit) {
    this.limit = limit;
    this.map = new Map();
  }

  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key, value) {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.limit) this.map.delete(this.map.keys().next().value);
  }

  clear() {
    this.map.clear();
  }
}

// Indic digit blocks, so "९६" and "96" compare equal.
const DIGIT_ZEROS = [0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66];

/** The numbers in a text (Indic digits normalised, thousands separators dropped), sorted. */
function numbersIn(text) {
  let value = String(text || '');
  for (const zero of DIGIT_ZEROS) {
    value = value.replace(new RegExp(`[\\u${zero.toString(16).padStart(4, '0')}-\\u${(zero + 9).toString(16).padStart(4, '0')}]`, 'g'),
      digit => String(digit.charCodeAt(0) - zero));
  }
  return (value.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(number => number.replace(/,/g, '')).sort();
}

/**
 * Machine translation can change numbers (seen live: "96 percent" became
 * "60 percent"). A translation is only used when every number survives it.
 */
function keepsNumbers(source, translated) {
  const a = numbersIn(source);
  const b = numbersIn(translated);
  return a.length === b.length && a.every((number, index) => number === b[index]);
}

function hash(...parts) {
  return crypto.createHash('sha256').update(parts.join('\u0000')).digest('hex');
}

/** Checks the first bytes, so only real audio containers reach Sarvam. */
function looksLikeAudio(buffer) {
  if (buffer.length < 12) return false;
  const hex4 = buffer.subarray(0, 4).toString('hex');
  if (hex4 === '1a45dfa3') return true; // WebM / Matroska
  const ascii4 = buffer.subarray(0, 4).toString('latin1');
  if (ascii4 === 'OggS') return true;
  if (ascii4 === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WAVE') return true;
  if (buffer.subarray(4, 8).toString('latin1') === 'ftyp') return true; // MP4 / M4A
  if (buffer.subarray(0, 3).toString('latin1') === 'ID3') return true; // MP3 with tags
  return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0; // MP3 / ADTS AAC frame
}

/**
 * Voice and language support on top of Sarvam AI, built to spend as few API
 * calls as possible:
 * - typed English questions never touch Sarvam;
 * - a non-English question costs one translation (to route it), and the AI
 *   answers directly in that language, so no second translation is needed
 *   unless the answer came from a fixed English template;
 * - each recording is one speech-to-text call;
 * - each spoken reply is one text-to-speech call, cached by its exact text,
 *   and concurrent identical requests share a single call.
 */
class VoiceService {
  constructor(client = new SarvamClient()) {
    this.client = client;
    this.speechCache = new LruCache(60);
    this.translationCache = new LruCache(300);
    this.inFlight = new Map();
  }

  static get LANGUAGES() {
    return LANGUAGES;
  }

  static isSupportedLanguage(code) {
    return typeof code === 'string' && Object.prototype.hasOwnProperty.call(LANGUAGES, code);
  }

  static languageName(code) {
    return LANGUAGES[code] || null;
  }

  /** The Indic language implied by the text's script, or null for Latin text. */
  static detectScriptLanguage(text) {
    const value = String(text || '');
    for (const [pattern, code] of SCRIPTS) {
      if (pattern.test(value)) return code;
    }
    return null;
  }

  static applyGlossary(text) {
    return HR_GLOSSARY.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
  }

  /** Answer text as it should be read aloud: no markdown, capped at a sentence end. */
  static speakableText(text) {
    let value = String(text || '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`#>]+/g, '')
      .replace(/^\s*[-•]\s+/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (value.length > SPEAK_MAX_CHARS) {
      const cut = value.slice(0, SPEAK_MAX_CHARS);
      const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('। '));
      value = end > SPEAK_MAX_CHARS * 0.4 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : cut.length)}…`;
    }
    return value;
  }

  /** Decodes and checks an uploaded recording. */
  static validateAudio(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new ValidationError('Request body must be a JSON object');
    }
    const mimeType = typeof payload.mimeType === 'string' ? payload.mimeType.split(';')[0].trim().toLowerCase() : '';
    if (!AUDIO_TYPES[mimeType]) {
      throw new ValidationError('Unsupported audio format. Use WebM, Ogg, MP4, MP3 or WAV.');
    }
    if (typeof payload.audio !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.audio)) {
      throw new ValidationError("Property 'audio' must be base64-encoded audio");
    }
    const buffer = Buffer.from(payload.audio, 'base64');
    if (buffer.length < MIN_AUDIO_BYTES) {
      throw new ValidationError('The recording is too short. Hold the microphone a little longer.');
    }
    if (buffer.length > MAX_AUDIO_BYTES) {
      throw new ValidationError('The recording is too long. Please keep it under 30 seconds.');
    }
    if (!looksLikeAudio(buffer)) {
      throw new ValidationError('The upload is not a recognised audio file.');
    }
    let hint = 'unknown';
    if (payload.languageCode !== undefined && payload.languageCode !== null && payload.languageCode !== 'unknown') {
      if (!VoiceService.isSupportedLanguage(payload.languageCode)) {
        throw new ValidationError('Unsupported language code');
      }
      hint = payload.languageCode;
    }
    return { buffer, mimeType, fileName: AUDIO_TYPES[mimeType], languageCode: hint };
  }

  static validateSpeech(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new ValidationError('Request body must be a JSON object');
    }
    if (typeof payload.text !== 'string' || !payload.text.trim()) {
      throw new ValidationError("Property 'text' is required");
    }
    if (payload.text.length > 4000) {
      throw new ValidationError("Property 'text' is too long");
    }
    const languageCode = payload.languageCode === undefined || payload.languageCode === null ? ENGLISH : payload.languageCode;
    if (!VoiceService.isSupportedLanguage(languageCode)) {
      throw new ValidationError('Unsupported language code');
    }
    return { text: payload.text, languageCode };
  }

  async transcribe(payload) {
    const audio = VoiceService.validateAudio(payload);
    const result = await this.client.transcribe(audio.buffer, audio.mimeType, audio.fileName, audio.languageCode);
    const transcript = result.transcript.replace(/\s+/g, ' ').trim().slice(0, 500);
    const detected = VoiceService.isSupportedLanguage(result.languageCode) ? result.languageCode : null;
    return {
      transcript,
      languageCode: detected || VoiceService.detectScriptLanguage(transcript) || ENGLISH
    };
  }

  static _speechKey(text, languageCode) {
    return hash('speak', languageCode, VoiceService.speakableText(text));
  }

  /** Whether this text is already cached or being fetched (costs no new credit). */
  hasSpeech(payload) {
    const key = VoiceService._speechKey(payload.text, payload.languageCode);
    return this.speechCache.map.has(key) || this.inFlight.has(key);
  }

  async speak(payload) {
    const { text, languageCode } = VoiceService.validateSpeech(payload);
    const spoken = VoiceService.speakableText(text);
    if (!spoken) throw new ValidationError('Nothing to read aloud');
    const key = VoiceService._speechKey(text, languageCode);

    const cached = this.speechCache.get(key);
    if (cached) return { ...cached, cached: true };

    // Two clicks (or two tabs) asking for the same audio share one call.
    if (!this.inFlight.has(key)) {
      const work = this.client.speak(spoken, languageCode)
        .then(audio => {
          const value = { ...audio, languageCode, characters: spoken.length };
          this.speechCache.set(key, value);
          return value;
        })
        .finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, work);
    }
    const value = await this.inFlight.get(key);
    return { ...value, cached: false };
  }

  async _translate(text, source, target) {
    const key = hash('translate', source, target, text);
    const cached = this.translationCache.get(key);
    if (cached) return cached;
    const result = await this.client.translate(text, source, target);
    if (result.text) this.translationCache.set(key, result);
    return result;
  }

  /**
   * Turns the question into English for routing when it is written in an
   * Indic script. Latin-script questions (English, or Hinglish typed in Latin
   * letters) are used as they are, with no API call.
   *
   * @param {string} question
   * @param {string|null} hint language the speech-to-text step detected
   * @returns {Promise<{question: string, original: string, language: string, translated: boolean}>}
   */
  async prepareQuestion(question, hint = null) {
    const scriptLanguage = VoiceService.detectScriptLanguage(question);
    if (!scriptLanguage || !SarvamClient.isConfigured()) {
      return { question, original: question, language: ENGLISH, translated: false };
    }
    const source = hint && hint !== ENGLISH && VoiceService.isSupportedLanguage(hint) ? hint : 'auto';
    try {
      const result = await this._translate(question, source, ENGLISH);
      const english = VoiceService.applyGlossary(result.text.trim());
      if (!english) throw new Error('empty translation');
      if (!keepsNumbers(question, english)) throw new Error('translation changed a number');
      const language = VoiceService.isSupportedLanguage(result.sourceLanguageCode) && result.sourceLanguageCode !== ENGLISH
        ? result.sourceLanguageCode
        : scriptLanguage;
      return { question: english.slice(0, 500), original: question, language, translated: true };
    } catch (err) {
      // Without a translation the AI still reads the original question and
      // answers in its language; only keyword routing is less precise.
      Logger.warn('Question translation skipped', { error: err.message });
      return { question, original: question, language: scriptLanguage, translated: false };
    }
  }

  /**
   * Puts an answer into the asker's language. Answers the AI already wrote in
   * that language (`localized`) cost nothing; fixed English replies are
   * translated in at most a few chunks, and stay English if that fails.
   */
  async localizeAnswer(result, language) {
    if (!result || language === ENGLISH || !VoiceService.isSupportedLanguage(language)) {
      return { result, language: ENGLISH };
    }
    if (result.localized) return { result, language };
    const text = String(result.answer || '').replace(/\*\*/g, '').trim();
    if (!text) return { result, language };

    const chunks = [];
    let current = '';
    for (const line of text.split('\n')) {
      if (line.length > TRANSLATE_CHUNK_CHARS) return { result, language: ENGLISH };
      if ((current ? current.length + 1 : 0) + line.length > TRANSLATE_CHUNK_CHARS) {
        chunks.push(current);
        current = line;
      } else {
        current = current ? `${current}\n${line}` : line;
      }
    }
    if (current) chunks.push(current);
    if (chunks.length > TRANSLATE_MAX_CHUNKS) return { result, language: ENGLISH };

    try {
      const translated = await Promise.all(chunks.map(chunk => this._translate(chunk, ENGLISH, language)));
      if (translated.some(item => !item.text)) throw new Error('empty translation');
      if (translated.some((item, index) => !keepsNumbers(chunks[index], item.text))) {
        throw new Error('translation changed a number');
      }
      return { result: { ...result, answer: translated.map(item => item.text).join('\n') }, language };
    } catch (err) {
      Logger.warn('Answer translation skipped', { error: err.message });
      return { result, language: ENGLISH };
    }
  }
}

let shared = null;
/** One instance per function instance, so every route shares the caches. */
VoiceService.shared = () => {
  if (!shared) shared = new VoiceService();
  return shared;
};

VoiceService.ENGLISH = ENGLISH;
VoiceService.SPEAK_MAX_CHARS = SPEAK_MAX_CHARS;
VoiceService.MAX_AUDIO_BYTES = MAX_AUDIO_BYTES;
VoiceService.LruCache = LruCache;
VoiceService.keepsNumbers = keepsNumbers;

module.exports = VoiceService;
