import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeAssertion, installFetch, installSdk, removeSdk, ok, fail } from './helpers.mjs';

const identity = await import('../src/services/webTabIdentity.ts');
const { employee360Api } = await import('../src/api/employee360Api.ts');
const { friendlyApiError } = await import('../src/api/apiClient.ts');

function fresh(t) {
  identity.resetWebTabIdentityForTests();
  t.after(() => {
    removeSdk();
    identity.resetWebTabIdentityForTests();
  });
}

test('a recording is uploaded as {audio, mimeType} in the body with the identity, never in the URL', async (t) => {
  fresh(t);
  const assertion = fakeAssertion();
  installSdk({ invoke: async () => ({ assertion }) });
  const calls = installFetch({ '/v1/voice/transcribe': () => ok({ transcript: 'What is my attendance?', languageCode: 'en-IN' }) });

  const result = await employee360Api.transcribeVoice('GkXfow==', 'audio/webm');
  assert.deepEqual(result, { transcript: 'What is my attendance?', languageCode: 'en-IN' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { audio: 'GkXfow==', mimeType: 'audio/webm', e360Assertion: assertion });
  assert.ok(!calls[0].url.includes(assertion));
  assert.ok(!calls[0].url.includes('?'));
});

test('transcription failures become clear messages', async (t) => {
  fresh(t);
  const cases = [
    [fail(400, 'VALIDATION_ERROR', 'The recording is too short. Hold the microphone a little longer.'), /too short/],
    [fail(429, 'RATE_LIMITED', 'Too many requests.'), /sending requests quickly/],
    [fail(502, 'EXTERNAL_SERVICE_ERROR', 'The voice service returned an error.'), /went wrong on our side/],
    [fail(503, 'CONFIGURATION_ERROR', 'Voice and translation are not configured.'), /not available right now/],
    [fail(401, 'UNAUTHORIZED', 'Authentication required'), /sign-in/],
  ];
  for (const [response, expected] of cases) {
    installFetch({ '/v1/voice/transcribe': () => response });
    const error = await employee360Api.transcribeVoice('GkXfow==', 'audio/webm').catch((err) => err);
    assert.match(friendlyApiError(error), expected);
  }
  installFetch({});
  const offline = await employee360Api.transcribeVoice('GkXfow==', 'audio/webm').catch((err) => err);
  assert.match(friendlyApiError(offline), /Can't reach/);
});
