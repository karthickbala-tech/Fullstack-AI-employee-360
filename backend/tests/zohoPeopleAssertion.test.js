'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { fn } = require('./helpers');

const ZohoPeopleAssertion = fn('middleware/zohoPeopleAssertion');
const { UnauthorizedError } = fn('utils/errors');

// Test-only material; not a real secret.
const SECRET = 'test-only-secret-0123456789abcdefghijklmnop';
const PORTAL = '60076299713';
const NOW = 1791456000;

const CLAIMS = {
  v: '1',
  type: 'e360_webtab',
  email: 'priya@example.com',
  portalId: PORTAL,
  iat: String(NOW),
  exp: String(NOW + 300),
  nonce: 'Q2xhdWRlTm9uY2UxMjM0'
};

const b64url = value => Buffer.from(value).toString('base64url');

function signPayload(payload, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest().toString('base64url');
}

function token(overrides = {}, { secret = SECRET, payload } = {}) {
  const canonical = payload ?? Object.values({ ...CLAIMS, ...overrides }).join('|');
  return `${b64url(canonical)}.${signPayload(canonical, secret)}`;
}

const verify = (value, options = {}) =>
  ZohoPeopleAssertion.verify(value, { secret: SECRET, portalId: PORTAL, now: NOW, ...options });

function rejectsWith(reason, value, options) {
  assert.throws(() => verify(value, options), err => err instanceof UnauthorizedError && err.statusCode === 401 && err.reason === reason);
}

test('a valid assertion for the configured portal returns its claims', () => {
  const claims = verify(token());
  assert.deepEqual(claims, { ...CLAIMS, iat: NOW, exp: NOW + 300 });
});

test('canonical payload is the documented fixed-order "|" string', () => {
  assert.equal(
    ZohoPeopleAssertion.canonicalize(CLAIMS),
    `1|e360_webtab|priya@example.com|${PORTAL}|${NOW}|${NOW + 300}|Q2xhdWRlTm9uY2UxMjM0`
  );
});

test('accepted within the clock-skew window at both ends', () => {
  assert.ok(verify(token({ iat: String(NOW + 20), exp: String(NOW + 200) })));
  assert.ok(verify(token(), { now: NOW + 300 + 20 }));
});

test('missing or too-short secret fails closed', () => {
  rejectsWith('secret_not_configured', token(), { secret: null });
  rejectsWith('secret_not_configured', token(), { secret: '' });
  rejectsWith('secret_not_configured', token({}, { secret: 'short' }), { secret: 'short' });
});

test('signature made with another key is rejected', () => {
  rejectsWith('bad_signature', token({}, { secret: 'another-secret-0123456789abcdefghijklmn' }));
});

test('tampered payload is rejected', () => {
  const [, signature] = token().split('.');
  const forged = `${b64url(Object.values({ ...CLAIMS, email: 'owner@example.com' }).join('|'))}.${signature}`;
  rejectsWith('bad_signature', forged);
});

test('malformed tokens are rejected', () => {
  for (const value of [undefined, '', 'abc', 'a.b.c', `${token()}.x`, '!!.??', `${b64url('x')}=.${signPayload('x')}`, 'a'.repeat(3000)]) {
    rejectsWith('malformed', value);
  }
  rejectsWith('bad_signature', `${b64url('x')}.${b64url('short')}`);
});

test('missing claims are rejected even when correctly signed', () => {
  rejectsWith('missing_claim', token({}, { payload: '1|e360_webtab|priya@example.com|60076299713|1791456000|1791456300' }));
  rejectsWith('missing_claim', token({ nonce: '' }));
});

test('wrong version or token type is rejected', () => {
  rejectsWith('wrong_version', token({ v: '2' }));
  rejectsWith('wrong_type', token({ type: 'e360_cliq' }));
});

test('wrong portal is rejected; the token cannot choose the tenant', () => {
  rejectsWith('wrong_portal', token({ portalId: '99999999999' }));
  rejectsWith('portal_not_configured', token(), { portalId: undefined });
});

test('expired token is rejected', () => {
  rejectsWith('expired', token(), { now: NOW + 300 + 31 });
});

test('token issued too far in the future is rejected', () => {
  rejectsWith('issued_in_future', token({ iat: String(NOW + 60), exp: String(NOW + 120) }));
});

test('lifetime above five minutes or non-positive is rejected', () => {
  rejectsWith('invalid_lifetime', token({ exp: String(NOW + 301) }));
  rejectsWith('invalid_lifetime', token({ exp: String(NOW) }));
});

test('non-canonical numbers and bad nonce are rejected', () => {
  rejectsWith('invalid_time', token({ iat: `0${NOW}` }));
  rejectsWith('invalid_time', token({ exp: '1.5e9' }));
  rejectsWith('invalid_nonce', token({ nonce: 'short' }));
});

test('changing any signed field after signing breaks the signature', () => {
  const [, signature] = token().split('.');
  const changes = {
    v: '2', type: 'e360_cliq', email: 'owner@example.com', portalId: '60076299714',
    iat: String(NOW - 10), exp: String(NOW + 200), nonce: 'AnotherNonce_123456'
  };
  for (const [field, value] of Object.entries(changes)) {
    const forged = `${b64url(Object.values({ ...CLAIMS, [field]: value }).join('|'))}.${signature}`;
    rejectsWith('bad_signature', forged);
  }
});

test('a rejected assertion carries its own error code', () => {
  assert.throws(() => verify('garbage'), err => err.code === 'INVALID_IDENTITY_ASSERTION');
});

test('a signature that is not valid base64url is malformed', () => {
  const [payload] = token().split('.');
  rejectsWith('malformed', `${payload}.not+base64/url=`);
});

test('invalid email is rejected', () => {
  for (const email of ['not-an-email', 'a@b', 'two words@example.com', `${'a'.repeat(250)}@example.com`]) {
    rejectsWith('invalid_email', token({ email }));
  }
});
