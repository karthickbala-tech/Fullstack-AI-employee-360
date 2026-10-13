'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('stream');
const { fn, silenceLogs } = require('./helpers');

const VoiceService = fn('services/voiceService');
const SarvamClient = fn('connectors/sarvam/sarvamClient');
const { RateLimiter } = fn('utils/rateLimiter');
const AskGenerator = fn('ai/askGenerator');
const AskAllController = fn('controllers/askAllController');
const ZohoPeopleEmployeeService = fn('connectors/zohoPeople/zohoPeopleEmployeeService');
const Environment = fn('config/environment');
const handler = fn('index.js');

const KEY = 'test-sarvam-key-not-real-000000000000';
const WEBM = Buffer.concat([Buffer.from('1a45dfa3', 'hex'), Buffer.alloc(4000, 1)]);

function fakeClient() {
  const calls = { transcribe: 0, speak: 0, translate: [] };
  return {
    calls,
    transcribe: async () => { calls.transcribe += 1; return { transcript: '  मेरी  उपस्थिति ', languageCode: 'hi-IN' }; },
    speak: async text => { calls.speak += 1; await new Promise(r => setTimeout(r, 5)); return { audioBase64: Buffer.from(text).toString('base64'), mimeType: 'audio/mpeg' }; },
    translate: async (input, source, target) => {
      calls.translate.push({ input, source, target });
      if (target === 'en-IN') return { text: 'How much presence do I have?', sourceLanguageCode: 'hi-IN' };
      return { text: `[${target}] ${input}`, sourceLanguageCode: source };
    }
  };
}

function withKey(t, value = KEY) {
  const saved = process.env.SARVAM_API_KEY;
  if (value === null) delete process.env.SARVAM_API_KEY;
  else process.env.SARVAM_API_KEY = value;
  t.after(() => {
    if (saved === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = saved;
  });
}

test('the script of a question picks its language; Latin text is English', () => {
  assert.equal(VoiceService.detectScriptLanguage('मेरी छुट्टी कितनी है?'), 'hi-IN');
  assert.equal(VoiceService.detectScriptLanguage('என் வருகை'), 'ta-IN');
  assert.equal(VoiceService.detectScriptLanguage('నా హాజరు'), 'te-IN');
  assert.equal(VoiceService.detectScriptLanguage('What is my attendance?'), null);
  assert.equal(VoiceService.detectScriptLanguage('mera attendance kitna hai'), null);
});

test('spoken text drops markdown and is capped at a sentence end', () => {
  assert.equal(VoiceService.speakableText('**Priya** has **96%** attendance.\n- one\n- two'), 'Priya has 96% attendance. one two');
  const long = 'This is one sentence about attendance. '.repeat(30);
  const spoken = VoiceService.speakableText(long);
  assert.ok(spoken.length <= VoiceService.SPEAK_MAX_CHARS);
  assert.ok(spoken.endsWith('.'));
});

test('only real, bounded audio is accepted for transcription', () => {
  const ok = VoiceService.validateAudio({ audio: WEBM.toString('base64'), mimeType: 'audio/webm;codecs=opus' });
  assert.equal(ok.mimeType, 'audio/webm');
  assert.equal(ok.languageCode, 'unknown');
  const reject = (payload, pattern) => assert.throws(() => VoiceService.validateAudio(payload), pattern);
  reject({ audio: WEBM.toString('base64'), mimeType: 'text/html' }, /Unsupported audio format/);
  reject({ audio: Buffer.from('<script>alert(1)</script>'.repeat(100)).toString('base64'), mimeType: 'audio/webm' }, /not a recognised audio/);
  reject({ audio: Buffer.alloc(100).toString('base64'), mimeType: 'audio/webm' }, /too short/);
  const huge = Buffer.concat([Buffer.from('1a45dfa3', 'hex'), Buffer.alloc(VoiceService.MAX_AUDIO_BYTES)]);
  reject({ audio: huge.toString('base64'), mimeType: 'audio/webm' }, /too long/);
  reject({ audio: 'not base64!!', mimeType: 'audio/webm' }, /base64/);
  reject({ audio: WEBM.toString('base64'), mimeType: 'audio/webm', languageCode: 'xx-YY' }, /Unsupported language/);
});

test('transcription is one call and returns a clean transcript with its language', async () => {
  const client = fakeClient();
  const service = new VoiceService(client);
  const result = await service.transcribe({ audio: WEBM.toString('base64'), mimeType: 'audio/webm' });
  assert.deepEqual(result, { transcript: 'मेरी उपस्थिति', languageCode: 'hi-IN' });
  assert.equal(client.calls.transcribe, 1);
});

test('speech is cached by text, and concurrent identical requests share one call', async () => {
  const client = fakeClient();
  const service = new VoiceService(client);
  const payload = { text: 'Priya has **96%** attendance.', languageCode: 'en-IN' };
  const [a, b] = await Promise.all([service.speak(payload), service.speak(payload)]);
  assert.equal(client.calls.speak, 1);
  assert.equal(a.audioBase64, b.audioBase64);
  assert.equal(service.hasSpeech(payload), true);
  const again = await service.speak(payload);
  assert.equal(again.cached, true);
  assert.equal(client.calls.speak, 1);
  await service.speak({ ...payload, languageCode: 'hi-IN' });
  assert.equal(client.calls.speak, 2, 'another language is another clip');
});

test('English questions never call the translator; Indian-language ones call it once', async t => {
  withKey(t);
  const client = fakeClient();
  const service = new VoiceService(client);

  const english = await service.prepareQuestion('What is my attendance?');
  assert.deepEqual(english, { question: 'What is my attendance?', original: 'What is my attendance?', language: 'en-IN', translated: false });
  assert.equal(client.calls.translate.length, 0);

  const hindi = await service.prepareQuestion('मेरी उपस्थिति कितनी है?', 'hi-IN');
  assert.equal(hindi.question, 'How much attendance do I have?', 'the HR glossary restores "attendance"');
  assert.equal(hindi.language, 'hi-IN');
  assert.deepEqual(client.calls.translate[0], { input: 'मेरी उपस्थिति कितनी है?', source: 'hi-IN', target: 'en-IN' });
  await service.prepareQuestion('मेरी उपस्थिति कितनी है?', 'hi-IN');
  assert.equal(client.calls.translate.length, 1, 'the same question is not translated twice');
});

test('without a Sarvam key, or when translation fails, the question is still answered', async t => {
  withKey(t, null);
  const client = fakeClient();
  const unconfigured = await new VoiceService(client).prepareQuestion('मेरी उपस्थिति');
  assert.equal(unconfigured.translated, false);
  assert.equal(client.calls.translate.length, 0);

  process.env.SARVAM_API_KEY = KEY;
  const failing = new VoiceService({ ...client, translate: async () => { throw new Error('down'); } });
  silenceLogs(t);
  const result = await failing.prepareQuestion('मेरी उपस्थिति');
  assert.deepEqual(result, { question: 'मेरी उपस्थिति', original: 'मेरी उपस्थिति', language: 'hi-IN', translated: false });
});

test('answers the AI already wrote in the language are not translated again', async t => {
  const client = fakeClient();
  const service = new VoiceService(client);
  const localized = await service.localizeAnswer({ answer: 'आपकी उपस्थिति 96% है।', localized: true }, 'hi-IN');
  assert.equal(localized.language, 'hi-IN');
  assert.equal(client.calls.translate.length, 0);

  const template = await service.localizeAnswer({ answer: 'There are **6** active employees.' }, 'hi-IN');
  assert.equal(template.result.answer, '[hi-IN] There are 6 active employees.');
  assert.equal(client.calls.translate.length, 1);

  const english = await service.localizeAnswer({ answer: 'Hi' }, 'en-IN');
  assert.equal(english.result.answer, 'Hi');
  assert.equal(client.calls.translate.length, 1);

  silenceLogs(t);
  const failing = new VoiceService({ ...client, translate: async () => { throw new Error('down'); } });
  const fallback = await failing.localizeAnswer({ answer: 'There are 6 active employees.' }, 'ta-IN');
  assert.deepEqual(fallback, { result: { answer: 'There are 6 active employees.' }, language: 'en-IN' }, 'English answer, read with the English voice');
});

test('a translation that changes a number is never used', async t => {
  silenceLogs(t);
  withKey(t);
  assert.equal(VoiceService.keepsNumbers('आपकी उपस्थिति ९६ प्रतिशत है', 'Your attendance is 96 percent'), true, 'Indic digits count');
  assert.equal(VoiceService.keepsNumbers('1,200 staff, 4.5 days', '1200 कर्मचारी, 4.5 दिन'), true);
  // Seen live on 2026-10-13: "96 प्रतिशत" came back as "60 percent".
  const wrong = new VoiceService({ translate: async (input, source, target) => ({ text: target === 'en-IN' ? 'Is my attendance 60 percent?' : 'आपकी उपस्थिति 60 प्रतिशत है।', sourceLanguageCode: 'hi-IN' }) });
  const question = await wrong.prepareQuestion('क्या मेरी उपस्थिति 96 प्रतिशत है?', 'hi-IN');
  assert.equal(question.translated, false);
  assert.equal(question.question, 'क्या मेरी उपस्थिति 96 प्रतिशत है?', 'the AI reads the original instead');
  const answer = await wrong.localizeAnswer({ answer: 'Your attendance is **96%**.' }, 'hi-IN');
  assert.deepEqual(answer, { result: { answer: 'Your attendance is **96%**.' }, language: 'en-IN' }, 'the accurate English answer is kept');
});

test('the rate limiter allows the limit, then answers 429 with Retry-After', () => {
  const limiter = new RateLimiter();
  const now = 1_000_000;
  limiter.consume('speak', 'emp:A', [2, 60000], now);
  limiter.consume('speak', 'emp:A', [2, 60000], now + 1);
  assert.throws(() => limiter.consume('speak', 'emp:A', [2, 60000], now + 2), err => err.statusCode === 429 && err.retryAfterSeconds === 60);
  limiter.consume('speak', 'emp:B', [2, 60000], now + 2);
  limiter.consume('speak', 'emp:A', [2, 60000], now + 60001);
  assert.equal(limiter.keyFor({ user: { employeeId: 'OWN01' } }, {}), 'emp:OWN01');
  assert.equal(limiter.keyFor({}, { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } }), 'ip:1.2.3.4');
});

test('the AI is told to answer in the asker\'s language and sees the original wording', async () => {
  const seen = [];
  const provider = {
    model: 'stub',
    generateCompletion: async (prompt, options) => {
      seen.push({ prompt, options });
      return JSON.stringify({ answer: 'आपकी उपस्थिति **96%** है।', type: 'Fact', confidence: 'high', evidence: ['attendance.attendancePercentage'], limitations: [] });
    }
  };
  const generator = new AskGenerator(provider);
  const canonical = {
    isLiveZohoData: true,
    metadata: { employeeId: 'E1' },
    limitations: [],
    employee: { employeeId: 'E1', fullName: 'Asha Rao' },
    deterministicMetrics: { attendancePercentage: { value: 96, formatted: '96%', classification: 'Calculation' } },
    attendance: { attendancePercentage: 96 },
    evidence: [{ domain: 'attendance', field: 'attendancePercentage', value: 96 }]
  };
  const result = await generator.answerQuestion(canonical, 'How much attendance do I have?', [], { languageName: 'Hindi', originalQuestion: 'मेरी उपस्थिति कितनी है?' });
  assert.match(seen[0].options.systemInstruction, /Write the answer text in Hindi/);
  assert.match(seen[0].options.systemInstruction, /warm, knowledgeable HR colleague/);
  assert.match(seen[0].prompt, /QUESTION AS ASKED \(Hindi/);
  assert.match(seen[0].prompt, /मेरी उपस्थिति कितनी है\?/);
  if (result.type !== 'Unknown') assert.equal(result.localized, true);

  seen.length = 0;
  await generator.answerQuestion(canonical, 'How much attendance do I have?', []);
  assert.doesNotMatch(seen[0].options.systemInstruction, /Write the answer text in/);
});

test('POST /v1/ask translates a Hindi question once and reports the reply language', async () => {
  const translate = [];
  const voice = new VoiceService({
    translate: async (input, source, target) => {
      translate.push(target);
      return target === 'en-IN' ? { text: 'How many active employees?', sourceLanguageCode: 'hi-IN' } : { text: '६ सक्रिय कर्मचारी हैं।', sourceLanguageCode: 'en-IN' };
    }
  });
  const asked = [];
  const service = { ask: async (question, context) => { asked.push({ question, language: context.language }); return { answer: 'There are 6 active employees.', type: 'Fact', evidence: [] }; } };
  const controller = new AskAllController(service, voice);
  const saved = process.env.SARVAM_API_KEY;
  process.env.SARVAM_API_KEY = KEY;
  let sent = null;
  try {
    const req = Readable.from([]);
    req.parsedBody = { question: 'कितने सक्रिय कर्मचारी हैं?', language: 'hi-IN' };
    const res = { writeHead: () => {}, end: body => { sent = JSON.parse(body); } };
    await controller.handle(req, res, {}, {});
  } finally {
    if (saved === undefined) delete process.env.SARVAM_API_KEY; else process.env.SARVAM_API_KEY = saved;
  }
  assert.equal(asked[0].question, 'How many active employees?');
  assert.equal(asked[0].language.name, 'Hindi');
  assert.deepEqual(translate, ['en-IN', 'hi-IN'], 'a fixed English reply is translated back once');
  assert.equal(sent.data.language, 'hi-IN');
  assert.equal(sent.data.answer, '६ सक्रिय कर्मचारी हैं।');
  assert.equal('localized' in sent.data, false);
});

async function post(path, body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.url = `/server/employee_360_ai_function${path}`;
  req.headers = { 'content-type': 'text/plain;charset=UTF-8' };
  const res = { status: null, body: '', headers: {} };
  await new Promise(resolve => {
    res.writeHead = (status, headers) => { res.status = status; res.headers = headers || {}; };
    res.end = chunk => { res.body = chunk || ''; resolve(); };
    handler(req, res);
  });
  return { status: res.status, text: res.body, json: res.body ? JSON.parse(res.body) : null };
}

test('voice routes: speak returns audio without exposing the key; bad audio is a 400', async t => {
  silenceLogs(t);
  withKey(t);
  const shared = VoiceService.shared();
  const savedClient = shared.client;
  const client = fakeClient();
  shared.client = client;
  t.after(() => { shared.client = savedClient; });

  const spoken = await post('/v1/voice/speak', { text: 'Hello there.', languageCode: 'en-IN' });
  assert.equal(spoken.status, 200);
  assert.equal(spoken.json.data.mimeType, 'audio/mpeg');
  assert.ok(spoken.json.data.audio.length > 0);
  assert.ok(!spoken.text.includes(KEY));

  const bad = await post('/v1/voice/transcribe', { audio: Buffer.from('not audio at all, just text'.repeat(80)).toString('base64'), mimeType: 'audio/webm' });
  assert.equal(bad.status, 400);
  assert.equal(client.calls.transcribe, 0, 'rejected input never reaches Sarvam');

  const heard = await post('/v1/voice/transcribe', { audio: WEBM.toString('base64'), mimeType: 'audio/webm' });
  assert.equal(heard.status, 200);
  assert.equal(heard.json.data.languageCode, 'hi-IN');
});

test('the Sarvam client maps upstream failures to safe errors and never retries', async t => {
  silenceLogs(t);
  withKey(t);
  let calls = 0;
  const respond = (status, body = {}) => async (url, init) => {
    calls += 1;
    assert.equal(init.headers['api-subscription-key'], KEY);
    return { ok: status === 200, status, headers: { get: () => null }, json: async () => body };
  };
  await assert.rejects(new SarvamClient(respond(429)).speak('hi', 'en-IN'), err => err.statusCode === 429);
  await assert.rejects(new SarvamClient(respond(403)).speak('hi', 'en-IN'), err => err.statusCode === 503 && !err.message.includes(KEY));
  await assert.rejects(new SarvamClient(respond(500)).translate('hi', 'auto', 'en-IN'), err => err.statusCode === 502);
  assert.equal(calls, 3, 'one call per request');
  const ok = await new SarvamClient(respond(200, { audios: ['AAAA'] })).speak('hi', 'en-IN');
  assert.deepEqual(ok, { audioBase64: 'AAAA', mimeType: 'audio/mpeg' });

  process.env.SARVAM_API_KEY = '';
  await assert.rejects(new SarvamClient(respond(200)).speak('hi', 'en-IN'), err => err.statusCode === 503);
  assert.equal(calls, 4, 'no call without a key');
});

test('the employee directory is reused briefly and concurrent loads share one Zoho call', async t => {
  const savedTtl = Environment.getDirectoryCacheTtlMs;
  Environment.getDirectoryCacheTtlMs = () => 60000;
  ZohoPeopleEmployeeService.clearDirectoryCache();
  t.after(() => {
    Environment.getDirectoryCacheTtlMs = savedTtl;
    ZohoPeopleEmployeeService.clearDirectoryCache();
  });
  let loads = 0;
  const service = new ZohoPeopleEmployeeService();
  service._loadLiveEmployeeDirectory = async () => {
    loads += 1;
    await new Promise(r => setTimeout(r, 5));
    return [{ employeeId: 'E1', fullName: 'A' }];
  };
  const [a, b] = await Promise.all([service.getLiveEmployeeDirectory(), service.getLiveEmployeeDirectory()]);
  a[0].fullName = 'changed by a caller';
  const c = await service.getLiveEmployeeDirectory();
  assert.equal(loads, 1);
  assert.equal(b[0].fullName, 'A');
  assert.equal(c[0].fullName, 'A', 'callers get copies, so one cannot change another\'s view');
});

test('a brief Zoho failure reuses the last good directory instead of failing sign-in', async t => {
  silenceLogs(t);
  const savedTtl = Environment.getDirectoryCacheTtlMs;
  Environment.getDirectoryCacheTtlMs = () => 1;
  ZohoPeopleEmployeeService.clearDirectoryCache();
  t.after(() => {
    Environment.getDirectoryCacheTtlMs = savedTtl;
    ZohoPeopleEmployeeService.clearDirectoryCache();
  });
  const service = new ZohoPeopleEmployeeService();
  let fail = false;
  service._loadLiveEmployeeDirectory = async () => {
    if (fail) throw new Error('Zoho 503');
    return [{ employeeId: 'E1', email: 'a@example.com' }];
  };
  await service.getLiveEmployeeDirectory();
  await new Promise(r => setTimeout(r, 5));
  fail = true;
  const stale = await service.getLiveEmployeeDirectory();
  assert.equal(stale[0].employeeId, 'E1');

  ZohoPeopleEmployeeService.clearDirectoryCache();
  await assert.rejects(service.getLiveEmployeeDirectory(), /Zoho 503/, 'with no good copy the error is reported, never an empty directory');
});

test('an answer is never empty: missing text becomes the polite no-data reply', () => {
  const empty = AskAllController.ensureAnswer({ answer: '  ', type: 'Fact', evidence: ['x'], route: 'employee' });
  assert.equal(empty.answer, "Sorry, I don't have the relevant data to answer that question.");
  assert.equal(empty.type, 'Unknown');
  assert.deepEqual(empty.evidence, []);
  assert.equal(AskAllController.ensureAnswer(null).answer, AskGenerator.NO_DATA_REPLY);
  const kept = { answer: 'Hi', type: 'Unknown' };
  assert.equal(AskAllController.ensureAnswer(kept), kept);
});

test('unrelated questions get the polite no-data reply, never outside knowledge', async () => {
  const generator = new AskGenerator({ model: 'stub', generateCompletion: async () => 'OUT_OF_SCOPE' });
  const reply = await generator.answerGeneral('What is the capital of France?');
  assert.match(reply.answer, /^Sorry, I don't have the relevant data to answer that question\./);
  const failed = await new AskGenerator({ model: 'stub', generateCompletion: async () => { throw new Error('timeout'); } })
    .answerQuestion({ isLiveZohoData: true, metadata: { employeeId: 'E1' }, limitations: [], evidence: [] }, 'What is my bonus?');
  assert.match(failed.answer, /^Sorry, I don't have the relevant data to answer that question\./);
  assert.equal(failed.type, 'Unknown');
});
