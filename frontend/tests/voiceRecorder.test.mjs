import test from 'node:test';
import assert from 'node:assert/strict';

// No real microphone: getUserMedia, MediaStream tracks, MediaRecorder and timers are stand-ins.

const v = await import('../src/services/voice.ts');

function fakeStream() {
  const tracks = [{ stopped: 0, stop() { this.stopped += 1; } }];
  return { tracks, getTracks: () => tracks };
}

function fakeRecorderClass({ supported = ['audio/webm;codecs=opus'], defaultMime = 'audio/webm', throwWhen = () => null } = {}) {
  const created = [];
  class FakeMediaRecorder {
    static isTypeSupported(type) {
      return supported.includes(type);
    }
    constructor(stream, options = {}) {
      const failure = throwWhen(options);
      if (failure) throw Object.assign(new Error(failure), { name: failure });
      this.options = options;
      this.mimeType = options.mimeType || defaultMime;
      this.state = 'inactive';
      this.ondataavailable = null;
      this.onstop = null;
      created.push(this);
    }
    start() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      queueMicrotask(() => {
        this.ondataavailable?.({ data: new Blob([new Uint8Array(4000)]) });
        this.onstop?.();
      });
    }
  }
  return { FakeMediaRecorder, created };
}

function deps(overrides = {}) {
  const timers = [];
  let clock = 1_000;
  const stream = fakeStream();
  const { FakeMediaRecorder, created } = fakeRecorderClass(overrides.recorder);
  const calls = { getUserMedia: [] };
  const value = {
    getUserMedia: async (constraints) => {
      calls.getUserMedia.push(constraints);
      return stream;
    },
    MediaRecorder: FakeMediaRecorder,
    setTimeout: (handler, ms) => {
      timers.push({ handler, ms, cleared: false });
      return timers.length;
    },
    clearTimeout: (id) => {
      if (timers[id - 1]) timers[id - 1].cleared = true;
    },
    now: () => clock,
    ...overrides.deps,
  };
  return { value, stream, created, timers, calls, advance: (ms) => { clock += ms; } };
}

test('microphone available: asks for audio, records, stops, and frees the microphone', async () => {
  const d = deps();
  const recorder = new v.VoiceRecorder(d.value);
  await recorder.start(() => {});
  assert.deepEqual(d.calls.getUserMedia, [{ audio: true }]);
  assert.equal(recorder.isRecording, true);
  assert.deepEqual(d.created[0].options, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000 });

  d.advance(2000);
  const recording = await recorder.stop();
  assert.equal(recording.mimeType, 'audio/webm', 'codec parameters are dropped for the upload');
  assert.equal(recording.durationMs, 2000);
  assert.ok(recording.blob.size > 0);
  assert.equal(d.stream.tracks[0].stopped, 1, 'microphone track stopped');
  assert.equal(d.timers[0].cleared, true, '30 s timer cleared');
  assert.equal(recorder.isRecording, false);
  assert.equal(await recorder.stop(), null, 'stopping again is harmless');
});

test('an embedded page is never refused up front: getUserMedia is always attempted', async (t) => {
  const savedTop = Object.getOwnPropertyDescriptor(globalThis, 'top');
  const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const savedRecorder = globalThis.MediaRecorder;
  t.after(() => {
    if (savedTop) Object.defineProperty(globalThis, 'top', savedTop); else delete globalThis.top;
    if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator);
    if (savedRecorder) globalThis.MediaRecorder = savedRecorder; else delete globalThis.MediaRecorder;
  });
  // window.self !== window.top, as inside the Zoho People Web Tab
  Object.defineProperty(globalThis, 'top', { value: {}, configurable: true });
  Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices: { getUserMedia: async () => fakeStream() } }, configurable: true });
  globalThis.MediaRecorder = fakeRecorderClass().FakeMediaRecorder;
  assert.notEqual(globalThis.self, globalThis.top);
  assert.equal(v.isVoiceInputSupported(), true);

  const d = deps();
  await new v.VoiceRecorder(d.value).start(() => {});
  assert.equal(d.calls.getUserMedia.length, 1);
  // The frame/permissions-policy guesses are gone from the module
  assert.equal('isInFrame' in v, false);
  assert.equal('frameAllowsMicrophone' in v, false);
  assert.equal('MICROPHONE_BLOCKED_BY_FRAME' in v, false);
});

test('a real permission denial is reported as such, and the next tap asks again', async () => {
  let deny = true;
  const d = deps({
    deps: {
      getUserMedia: async () => {
        if (deny) throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
        return fakeStream();
      },
    },
  });
  const recorder = new v.VoiceRecorder(d.value);
  await assert.rejects(recorder.start(() => {}), { name: 'NotAllowedError' });
  assert.equal(recorder.isRecording, false);
  assert.match(v.microphoneErrorMessage({ name: 'NotAllowedError' }), /permission was denied/);
  assert.doesNotMatch(v.microphoneErrorMessage({ name: 'NotAllowedError' }), /Zoho doesn't allow/);

  deny = false;
  await recorder.start(() => {});
  assert.equal(recorder.isRecording, true, 'not remembered as blocked');
  recorder.cancel();
});

test('no microphone and unsupported recording give their own messages', () => {
  assert.match(v.microphoneErrorMessage({ name: 'NotFoundError' }), /No microphone was found/);
  assert.match(v.microphoneErrorMessage({ name: 'NotReadableError' }), /in use by another app/);
  assert.match(v.microphoneErrorMessage({ name: 'NotSupportedError' }), /can't record audio/);
  assert.match(v.microphoneErrorMessage({ name: 'SecurityError' }), /blocked microphone access/);
  assert.match(v.microphoneErrorMessage(new Error('?')), /try again/);
});

test('a recorder that cannot start still gives the microphone back', async () => {
  const d = deps({ recorder: { throwWhen: () => 'NotSupportedError' } });
  await assert.rejects(new v.VoiceRecorder(d.value).start(() => {}), { name: 'NotSupportedError' });
  assert.equal(d.stream.tracks[0].stopped, 1);
});

test('when the low bitrate is refused, recording continues at the default bitrate', async () => {
  const d = deps({ recorder: { throwWhen: (options) => (options.audioBitsPerSecond ? 'NotSupportedError' : null) } });
  const recorder = new v.VoiceRecorder(d.value);
  await recorder.start(() => {});
  assert.deepEqual(d.created[0].options, { mimeType: 'audio/webm;codecs=opus' });
  recorder.cancel();
});

test('without a preferred format, the browser default is used only if the backend accepts it', async () => {
  const ok = deps({ recorder: { supported: [], defaultMime: 'audio/mp4' } });
  const recorder = new v.VoiceRecorder(ok.value);
  await recorder.start(() => {});
  assert.equal((await recorder.stop()).mimeType, 'audio/mp4');

  const bad = deps({ recorder: { supported: [], defaultMime: 'audio/x-unknown' } });
  await assert.rejects(new v.VoiceRecorder(bad.value).start(() => {}), { name: 'NotSupportedError' });
  assert.equal(bad.stream.tracks[0].stopped, 1);
});

test('cancel while the browser is still asking: the microphone is released once granted', async () => {
  let grant;
  const stream = fakeStream();
  const d = deps({ deps: { getUserMedia: () => new Promise((resolve) => { grant = () => resolve(stream); }) } });
  const recorder = new v.VoiceRecorder(d.value);
  const starting = recorder.start(() => {});
  recorder.cancel();
  grant();
  await assert.rejects(starting, { name: 'AbortError' });
  assert.equal(stream.tracks[0].stopped, 1);
  assert.equal(recorder.isRecording, false);
});

test('cancel during recording discards it and frees the microphone', async () => {
  const d = deps();
  const recorder = new v.VoiceRecorder(d.value);
  await recorder.start(() => {});
  recorder.cancel();
  assert.equal(d.stream.tracks[0].stopped, 1);
  assert.equal(d.timers[0].cleared, true);
  assert.equal(await recorder.stop(), null, 'nothing to send after cancel');
});

test('recording is limited to 30 seconds', async () => {
  const d = deps();
  let limitReached = 0;
  const recorder = new v.VoiceRecorder(d.value);
  await recorder.start(() => { limitReached += 1; });
  assert.equal(d.timers[0].ms, 30000);
  assert.equal(v.MAX_RECORDING_MS, 30000);
  d.timers[0].handler();
  assert.equal(limitReached, 1);
  d.advance(30000);
  const recording = await recorder.stop();
  assert.equal(recording.durationMs, 30000);
  assert.equal(d.stream.tracks[0].stopped, 1);
});

test('a second start while one is starting or recording does not open the microphone twice', async () => {
  const d = deps();
  const recorder = new v.VoiceRecorder(d.value);
  await Promise.all([recorder.start(() => {}), recorder.start(() => {})]);
  await recorder.start(() => {});
  assert.equal(d.calls.getUserMedia.length, 1);
  recorder.cancel();
});

test('upload types follow the backend transcription route', () => {
  assert.equal(v.uploadMimeType('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(v.uploadMimeType('audio/ogg;codecs=opus'), 'audio/ogg');
  assert.equal(v.uploadMimeType('audio/mp4'), 'audio/mp4');
  assert.equal(v.uploadMimeType('video/webm'), null);
});

test('a refusal after the user allowed the site is explained as the Zoho frame not passing the microphone', async () => {
  const frame = { self: 1, top: 2 };
  const top = { self: 1, top: 1 };
  const docWith = (allows) => ({ permissionsPolicy: { allowsFeature: () => allows } });
  const perms = (state) => ({ query: async () => ({ state }) });
  const denied = { name: 'NotAllowedError' };

  const notDelegated = await v.describeMicrophoneDenial(denied, { win: frame, doc: docWith(false), permissions: perms('granted') });
  assert.deepEqual(notDelegated, { errorName: 'NotAllowedError', inFrame: true, framePolicyAllows: false, sitePermission: 'granted' });
  assert.equal(v.microphoneDenialMessage(notDelegated), v.MICROPHONE_NOT_DELEGATED);

  // Site allowed but the browser can't report the frame policy: still the frame
  const grantedOnly = await v.describeMicrophoneDenial(denied, { win: frame, doc: {}, permissions: perms('granted') });
  assert.equal(v.microphoneDenialMessage(grantedOnly), v.MICROPHONE_NOT_DELEGATED);

  // The user really blocked the site: tell them to allow it
  const blockedSite = await v.describeMicrophoneDenial(denied, { win: frame, doc: docWith(true), permissions: perms('denied') });
  assert.match(v.microphoneDenialMessage(blockedSite), /permission was denied/);

  // Top-level page: never blamed on a frame
  const topLevel = await v.describeMicrophoneDenial(denied, { win: top, doc: docWith(false), permissions: perms('granted') });
  assert.match(v.microphoneDenialMessage(topLevel), /permission was denied/);

  // Other errors keep their own message; a failing permissions API is tolerated
  const noMic = await v.describeMicrophoneDenial({ name: 'NotFoundError' }, { win: frame, doc: docWith(false), permissions: { query: async () => { throw new Error('unsupported'); } } });
  assert.equal(noMic.sitePermission, null);
  assert.match(v.microphoneDenialMessage(noMic), /No microphone was found/);
});

function stubWindow(t, popup) {
  const listeners = new Set();
  const saved = {
    open: globalThis.open,
    location: Object.getOwnPropertyDescriptor(globalThis, 'location'),
    add: globalThis.addEventListener,
    remove: globalThis.removeEventListener,
  };
  const opened = [];
  globalThis.open = (...args) => { opened.push(args); return popup; };
  Object.defineProperty(globalThis, 'location', {
    value: { href: 'https://widgets.example/app/widget.html', pathname: '/app/widget.html', origin: 'https://widgets.example' },
    configurable: true,
  });
  globalThis.addEventListener = (type, fn) => { if (type === 'message') listeners.add(fn); };
  globalThis.removeEventListener = (type, fn) => listeners.delete(fn);
  t.after(() => {
    globalThis.open = saved.open;
    if (saved.location) Object.defineProperty(globalThis, 'location', saved.location); else delete globalThis.location;
    globalThis.addEventListener = saved.add;
    globalThis.removeEventListener = saved.remove;
  });
  return { opened, emit: (event) => [...listeners].forEach((fn) => fn(event)), listeners };
}

test('the recorder window opens next to the widget page and returns the recording from that window only', async (t) => {
  const popup = { closed: false, focus() {} };
  const w = stubWindow(t, popup);
  const pending = v.recordInWindow();
  assert.equal(w.opened[0][0], 'https://widgets.example/app/voice.html');

  const blob = new Blob([new Uint8Array(2000)], { type: 'audio/webm' });
  // Another window, another origin, or an unaccepted type are ignored
  w.emit({ source: {}, origin: 'https://widgets.example', data: { source: 'e360-voice', type: 'recording', blob, mimeType: 'audio/webm' } });
  w.emit({ source: popup, origin: 'https://evil.example', data: { source: 'e360-voice', type: 'recording', blob, mimeType: 'audio/webm' } });
  w.emit({ source: popup, origin: 'https://widgets.example', data: { source: 'e360-voice', type: 'recording', blob, mimeType: 'video/webm' } });
  w.emit({ source: popup, origin: 'https://widgets.example', data: { source: 'e360-voice', type: 'recording', blob, mimeType: 'audio/webm;codecs=opus', durationMs: 2500 } });
  const recording = await pending;
  assert.deepEqual({ mimeType: recording.mimeType, durationMs: recording.durationMs }, { mimeType: 'audio/webm', durationMs: 2500 });
  assert.equal(w.listeners.size, 0, 'listener removed');
});

test('the recorder window: cancel gives null, a blocked pop-up is reported', async (t) => {
  const popup = { closed: false, focus() {} };
  const w = stubWindow(t, popup);
  const pending = v.recordInWindow();
  w.emit({ source: popup, origin: 'https://widgets.example', data: { source: 'e360-voice', type: 'cancel' } });
  assert.equal(await pending, null);

  globalThis.open = () => null;
  await assert.rejects(v.recordInWindow(), { name: 'PopupBlockedError' });
  assert.match(v.RECORDER_WINDOW_BLOCKED, /Allow pop-ups/);
  assert.equal(v.recorderWindowUrl({ href: 'http://localhost:5173/', pathname: '/' }), 'http://localhost:5173/app/voice.html');
});
