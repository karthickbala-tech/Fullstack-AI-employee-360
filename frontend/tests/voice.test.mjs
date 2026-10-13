import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal audio element for Node: play() resolves, pause() flips the flag.
class FakeAudio {
  constructor() {
    this.paused = true;
    this.src = '';
    this.dataset = {};
    this.plays = 0;
  }
  play() {
    this.paused = false;
    this.plays += 1;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}
globalThis.Audio = FakeAudio;

const v = await import('../src/services/voice.ts');

test('the first supported recording format is used; none means no voice input', () => {
  assert.equal(v.pickRecordingMimeType(() => true), 'audio/webm;codecs=opus');
  assert.equal(v.pickRecordingMimeType((type) => type === 'audio/mp4'), 'audio/mp4', 'Safari');
  assert.equal(v.pickRecordingMimeType(() => false), null);
  assert.equal(
    v.pickRecordingMimeType((type) => {
      if (type.includes('ogg')) return true;
      throw new Error('unknown');
    }),
    'audio/ogg;codecs=opus'
  );
});

test('microphone failures read as plain guidance', () => {
  assert.match(v.microphoneErrorMessage({ name: 'NotAllowedError' }), /permission was denied/);
  assert.match(v.microphoneErrorMessage({ name: 'NotFoundError' }), /No microphone/);
  assert.match(v.microphoneErrorMessage(new Error('x')), /type your question/);
});

test('a spoken answer is fetched once, even with repeated or overlapping clicks', async () => {
  const player = new v.VoicePlayer();
  let fetches = 0;
  const fetcher = async () => {
    fetches += 1;
    await new Promise((r) => setTimeout(r, 5));
    return { audio: Buffer.from('mp3').toString('base64'), mimeType: 'audio/mpeg' };
  };
  await Promise.all([player.play('Hello', 'en-IN', fetcher), player.play('Hello', 'en-IN', fetcher)]);
  await player.play('Hello', 'en-IN', fetcher);
  assert.equal(fetches, 1);
  await player.play('Hello', 'hi-IN', fetcher);
  assert.equal(fetches, 2, 'another language is another clip');
});

test('the player reports what is playing, and stop() wins over a slow fetch', async () => {
  const player = new v.VoicePlayer();
  const states = [];
  player.subscribe((state) => states.push(state));
  let release;
  const slow = () => new Promise((resolve) => {
    release = () => resolve({ audio: Buffer.from('mp3').toString('base64'), mimeType: 'audio/mpeg' });
  });
  const playing = player.play('Answer', 'en-IN', slow);
  assert.equal(player.isCurrent('Answer', 'en-IN'), true);
  assert.deepEqual(states.at(-1), { key: 'en-IN|Answer', loading: true });
  player.stop();
  release();
  await playing;
  assert.deepEqual(states.at(-1), { key: null, loading: false }, 'a stopped request never starts playing');
});

test('a failed fetch clears the state and can be retried', async () => {
  const player = new v.VoicePlayer();
  let calls = 0;
  const failing = async () => {
    calls += 1;
    throw new Error('voice down');
  };
  await assert.rejects(player.play('Hi', 'en-IN', failing), /voice down/);
  assert.equal(player.isCurrent('Hi', 'en-IN'), false);
  await assert.rejects(player.play('Hi', 'en-IN', failing));
  assert.equal(calls, 2, 'failures are not cached');
});

