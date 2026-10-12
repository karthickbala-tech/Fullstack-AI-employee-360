import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeAssertion, installSdk, removeSdk } from './helpers.mjs';

const identity = await import('../src/services/webTabIdentity.ts');

function fresh(t) {
  identity.resetWebTabIdentityForTests();
  t.after(() => {
    removeSdk();
    identity.resetWebTabIdentityForTests();
  });
}

test('outside Zoho People there is no SDK and no assertion', async (t) => {
  fresh(t);
  removeSdk();
  assert.equal(await identity.initWebTabSdk(), false);
  assert.equal(await identity.getIdentityAssertion(), null);
  assert.equal(identity.getIdentityStatus(), 'sdk_unavailable');
});

test('the production identity function is requested, never the probe', async (t) => {
  fresh(t);
  const assertion = fakeAssertion();
  const calls = installSdk({ invoke: async () => ({ assertion }) });
  assert.equal(await identity.getIdentityAssertion(), assertion);
  assert.deepEqual(calls.invoke, [{ fnName: 'e360_identity_assertion', params: '{}' }]);
  assert.equal(identity.getIdentityStatus(), 'available');
});

test('the assertion is found in the response shapes the SDK may return', async (t) => {
  const assertion = fakeAssertion();
  const shapes = [
    { assertion },
    JSON.stringify({ assertion }),
    { Status: 'Success', response: JSON.stringify({ assertion }) },
    { result: { output: { assertion } } },
  ];
  for (const shape of shapes) {
    fresh(t);
    installSdk({ invoke: async () => shape });
    assert.equal(await identity.getIdentityAssertion(), assertion, JSON.stringify(shape));
  }
});

test('empty, malformed or error responses give no assertion', async (t) => {
  for (const shape of [undefined, null, '', { Status: 'Success' }, { assertion: 'no-dot' }, { assertion: 'bad chars!.x' }, '{not json', { error: 'no_login_user' }]) {
    fresh(t);
    installSdk({ invoke: async () => shape });
    assert.equal(await identity.getIdentityAssertion(), null, JSON.stringify(shape));
    assert.equal(identity.getIdentityStatus(), 'function_unavailable');
  }
});

test('an SDK error from the function gives no assertion', async (t) => {
  fresh(t);
  installSdk({ invoke: async () => { throw new Error('Function not found'); } });
  assert.equal(await identity.getIdentityAssertion(), null);
  assert.equal(identity.getIdentityStatus(), 'function_unavailable');
});

test('an SDK init that never answers times out and gives no assertion', async (t) => {
  fresh(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = installSdk({ init: () => new Promise(() => {}), invoke: async () => ({ assertion: fakeAssertion() }) });
  const pending = identity.getIdentityAssertion();
  await Promise.resolve();
  t.mock.timers.tick(8000);
  assert.equal(await pending, null);
  assert.equal(identity.getIdentityStatus(), 'sdk_unavailable');
  assert.equal(calls.invoke.length, 0);
});

test('the SDK is initialized only once', async (t) => {
  fresh(t);
  const calls = installSdk({ invoke: async () => ({ assertion: fakeAssertion() }) });
  await Promise.all([identity.initWebTabSdk(), identity.initWebTabSdk(), identity.getIdentityAssertion()]);
  await identity.getIdentityAssertion();
  assert.equal(calls.init, 1);
});

test('an assertion is reused while valid and refreshed before it expires', async (t) => {
  fresh(t);
  t.mock.timers.enable({ apis: ['Date'], now: 1791456000000 });
  const calls = installSdk({ invoke: async () => ({ assertion: fakeAssertion({ iat: Math.floor(Date.now() / 1000) }) }) });

  const first = await identity.getIdentityAssertion();
  t.mock.timers.tick(60 * 1000);
  assert.equal(await identity.getIdentityAssertion(), first);
  assert.equal(calls.invoke.length, 1);

  // 240 s lifetime, 30 s margin: after 211 s a new assertion is fetched.
  t.mock.timers.tick(151 * 1000);
  const second = await identity.getIdentityAssertion();
  assert.equal(calls.invoke.length, 2);
  assert.notEqual(second, first);
});

test('an assertion is never reused past its declared expiry, even if short-lived', async (t) => {
  fresh(t);
  t.mock.timers.enable({ apis: ['Date'], now: 1791456000000 });
  const iat = Math.floor(Date.now() / 1000);
  const calls = installSdk({ invoke: async () => ({ assertion: fakeAssertion({ iat, exp: iat + 40 }) }) });
  await identity.getIdentityAssertion();
  t.mock.timers.tick(11 * 1000);
  await identity.getIdentityAssertion();
  assert.equal(calls.invoke.length, 2);
});

test('invalidation forces a new assertion; a failure is not retried immediately', async (t) => {
  fresh(t);
  t.mock.timers.enable({ apis: ['Date'], now: 1791456000000 });
  let fail = false;
  const calls = installSdk({ invoke: async () => (fail ? { Status: 'Success' } : { assertion: fakeAssertion() }) });

  await identity.getIdentityAssertion();
  identity.invalidateIdentityAssertion();
  await identity.getIdentityAssertion();
  assert.equal(calls.invoke.length, 2);

  fail = true;
  identity.invalidateIdentityAssertion();
  assert.equal(await identity.getIdentityAssertion(), null);
  assert.equal(await identity.getIdentityAssertion(), null);
  assert.equal(calls.invoke.length, 3);

  t.mock.timers.tick(61 * 1000);
  await identity.getIdentityAssertion();
  assert.equal(calls.invoke.length, 4);
});
