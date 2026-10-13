import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeAssertion, installFetch, installSdk, removeSdk, ok, fail } from './helpers.mjs';

const identity = await import('../src/services/webTabIdentity.ts');
const { apiRequest } = await import('../src/api/apiClient.ts');

function fresh(t) {
  identity.resetWebTabIdentityForTests();
  t.after(() => {
    removeSdk();
    identity.resetWebTabIdentityForTests();
  });
}

test('inside Zoho People, a request that went out without identity gets one and is retried once', async (t) => {
  fresh(t);
  // The first identity call fails (Zoho hiccup), later ones succeed
  installSdk({ invoke: async (options, n) => (n > 1 ? { assertion: fakeAssertion() } : { Status: 'Success' }) });
  const calls = installFetch({
    '/v1/me': ({ body }) => (body && body.e360Assertion ? ok({ role: 'admin' }) : fail(401, 'UNAUTHORIZED', 'Authentication required')),
  });
  const result = await apiRequest('https://api.example/v1/me', { method: 'GET' });
  assert.equal(result.data.role, 'admin');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body, null, 'first attempt had no identity');
  assert.ok(calls[1].body.e360Assertion, 'retry carries the identity');
});

test('outside Zoho People a 401 is not retried, and a persistent 401 is not retried in a loop', async (t) => {
  fresh(t);
  let calls = installFetch({ '/v1/me': () => fail(401, 'UNAUTHORIZED', 'Authentication required') });
  await assert.rejects(apiRequest('https://api.example/v1/me', { method: 'GET' }), (err) => err.statusCode === 401);
  assert.equal(calls.length, 1);

  installSdk({ invoke: async () => ({ assertion: fakeAssertion() }) });
  calls = installFetch({ '/v1/me': () => fail(401, 'INVALID_IDENTITY_ASSERTION', 'Identity assertion could not be verified') });
  await assert.rejects(apiRequest('https://api.example/v1/me', { method: 'GET' }));
  assert.ok(calls.length <= 2, `at most one retry, got ${calls.length}`);
});
