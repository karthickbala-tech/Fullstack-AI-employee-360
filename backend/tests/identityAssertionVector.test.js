'use strict';

// The Zoho People function (zoho-people/e360_identity_assertion.deluge) builds the
// assertion with standard base64 and then converts it to base64url. These tests
// reproduce that exact pipeline and the published test vector, so the Deluge
// output and the Node verifier are checked against the same bytes.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { fn } = require('./helpers');

const ZohoPeopleAssertion = fn('middleware/zohoPeopleAssertion');

const VECTOR = {
  secret: 'e360-test-vector-secret-not-for-production-0001',
  payload: '1|e360_webtab|vector.user@example.com|60076299713|1791456000|1791456240|1791456000123123456789987654321',
  token: 'MXxlMzYwX3dlYnRhYnx2ZWN0b3IudXNlckBleGFtcGxlLmNvbXw2MDA3NjI5OTcxM3wxNzkxNDU2MDAwfDE3OTE0NTYyNDB8MTc5MTQ1NjAwMDEyMzEyMzQ1Njc4OTk4NzY1NDMyMQ.0yzEVJFtbefVEZUSDe9DZ5xIYqMPWGysppqwL8CPe_8'
};

// Deluge: base64Encode / hmacsha256(..., "base64") give standard base64, then
// replaceAll("+","-",true).replaceAll("/","_",true).replaceAll("=","",true).
const delugeBase64Url = text => text.split('+').join('-').split('/').join('_').split('=').join('');

function delugeAssertion(secret, payload) {
  const payloadPart = delugeBase64Url(Buffer.from(payload, 'utf8').toString('base64'));
  const signaturePart = delugeBase64Url(crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('base64'));
  return `${payloadPart}.${signaturePart}`;
}

test('the Deluge pipeline reproduces the published test vector', () => {
  assert.equal(delugeAssertion(VECTOR.secret, VECTOR.payload), VECTOR.token);
});

test('the published test vector verifies inside its validity window', () => {
  const claims = ZohoPeopleAssertion.verify(VECTOR.token, { secret: VECTOR.secret, portalId: '60076299713', now: 1791456100 });
  assert.equal(claims.email, 'vector.user@example.com');
  assert.equal(claims.exp - claims.iat, 240);
});

test('Deluge-shaped assertions verify for many random nonces and times', () => {
  const secret = crypto.randomBytes(32).toString('hex');
  for (let i = 0; i < 200; i++) {
    const nowMs = String(1791456000000 + Math.floor(Math.random() * 1e9));
    const iat = nowMs.slice(0, -3);
    const exp = String(Number(iat) + 240);
    const nonce = nowMs + String(100000000 + Math.floor(Math.random() * 899999999)) + String(100000000 + Math.floor(Math.random() * 899999999));
    const payload = `1|e360_webtab|First.Last+tag@example.co.in|60076299713|${iat}|${exp}|${nonce}`;
    const claims = ZohoPeopleAssertion.verify(delugeAssertion(secret, payload), { secret, portalId: '60076299713', now: Number(iat) + 1 });
    assert.equal(claims.email, 'First.Last+tag@example.co.in');
  }
});

test('the committed Deluge source carries no real secret and no probe material', () => {
  const dir = path.resolve(__dirname, '../zoho-people');
  const source = fs.readFileSync(path.join(dir, 'e360_identity_assertion.deluge'), 'utf8');
  assert.match(source, /secret = "REPLACE_WITH_SIGNING_SECRET";/);
  assert.doesNotMatch(source, /probe-key|probe-data/);
  assert.match(source, /zoho\.loginuserid/);
  assert.match(source, /lifetimeSeconds = 240;/);
  assert.ok(240 <= ZohoPeopleAssertion.MAX_LIFETIME_SECONDS);
});
