'use strict';

const crypto = require('crypto');
const { UnauthorizedError } = require('../utils/errors');
const { ERROR_CODES } = require('../config/constants');

/**
 * Verifies the short-lived identity assertion the Zoho People Web Tab obtains
 * from a Zoho People (Deluge) function and sends in the `x-e360-assertion` header.
 *
 * TOKEN FORMAT
 *   <base64url(canonicalPayload)>.<base64url(signature)>
 *   base64url = RFC 4648 section 5 alphabet (A-Z a-z 0-9 - _), no "=" padding.
 *
 * CANONICAL PAYLOAD (the exact UTF-8 string that is signed and transmitted)
 *   seven fields, in this fixed order, joined by "|", no spaces, no trailing newline:
 *     v|type|email|portalId|iat|exp|nonce
 *   v        "1"
 *   type     "e360_webtab"
 *   email    the Zoho People login email (zoho.loginuserid), as returned
 *   portalId the Zoho People portal ID, decimal digits
 *   iat      issued-at, Unix time in whole seconds, decimal, no leading zeros
 *   exp      expiry, Unix time in whole seconds, decimal, no leading zeros
 *   nonce    16-128 characters from A-Z a-z 0-9 - _
 *   Example: 1|e360_webtab|user@example.com|60076299713|1791456000|1791456300|Q2xhdWRlTm9uY2UxMjM0
 *   No field may contain "|"; the verifier rejects any payload that does not
 *   re-serialize to exactly the same string.
 *
 * SIGNATURE
 *   HMAC-SHA256 with the shared secret (UTF-8 text) as the key and the canonical
 *   payload (UTF-8) as the message; the 32-byte result is base64url encoded.
 *   In Deluge, the standard-base64 output of zoho.encryption.hmacsha256(secret,
 *   payload, "base64") becomes base64url by replacing "+" with "-", "/" with "_"
 *   and removing "=".
 *
 * The assertion never supplies the tenant: portalId must equal the configured
 * portal. Nothing from the token is logged.
 */

const VERSION = '1';
const TOKEN_TYPE = 'e360_webtab';
const MAX_LIFETIME_SECONDS = 300;
const CLOCK_SKEW_SECONDS = 30;
const MAX_TOKEN_LENGTH = 2048;
const MIN_SECRET_LENGTH = 32;
const SIGNATURE_BYTES = 32;

const FIELDS = ['v', 'type', 'email', 'portalId', 'iat', 'exp', 'nonce'];
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const EMAIL = /^[^\s@|]+@[^\s@|]+\.[^\s@|]+$/;
const MAX_EMAIL_LENGTH = 254;
const PORTAL_ID = /^[0-9]+$/;
const SECONDS = /^(0|[1-9][0-9]{0,11})$/;
const NONCE = /^[A-Za-z0-9_-]{16,128}$/;

function reject(reason) {
  const err = new UnauthorizedError('Identity assertion could not be verified');
  // Distinct code so a client can tell a rejected assertion from a missing sign-in.
  err.code = ERROR_CODES.INVALID_IDENTITY_ASSERTION;
  err.reason = reason;
  return err;
}

function decodeBase64Url(part) {
  if (!part || !BASE64URL.test(part)) return null;
  const bytes = Buffer.from(part, 'base64url');
  // Round-trip check rejects non-canonical encodings of the same bytes.
  return bytes.toString('base64url') === part ? bytes : null;
}

class ZohoPeopleAssertion {
  static canonicalize(claims) {
    return FIELDS.map(field => String(claims[field])).join('|');
  }

  static sign(canonicalPayload, secret) {
    return crypto.createHmac('sha256', Buffer.from(secret, 'utf8'))
      .update(Buffer.from(canonicalPayload, 'utf8'))
      .digest();
  }

  /**
   * Returns the verified claims { v, type, email, portalId, iat, exp, nonce }
   * or throws UnauthorizedError (with a non-sensitive `reason` for logs/tests).
   *
   * @param {string} token value of the x-e360-assertion header
   * @param {object} options { secret, portalId, now } where now is Unix seconds
   */
  static verify(token, { secret, portalId, now = Math.floor(Date.now() / 1000) } = {}) {
    if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
      throw reject('secret_not_configured');
    }
    if (typeof portalId !== 'string' || !PORTAL_ID.test(portalId)) {
      throw reject('portal_not_configured');
    }

    if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
      throw reject('malformed');
    }
    const parts = token.split('.');
    if (parts.length !== 2) throw reject('malformed');

    const payloadBytes = decodeBase64Url(parts[0]);
    const signature = decodeBase64Url(parts[1]);
    if (!payloadBytes || !signature) throw reject('malformed');

    // The signature is checked over the exact transmitted bytes before any claim is trusted.
    const expected = ZohoPeopleAssertion.sign(payloadBytes.toString('utf8'), secret);
    if (signature.length !== SIGNATURE_BYTES || !crypto.timingSafeEqual(signature, expected)) {
      throw reject('bad_signature');
    }

    const canonicalPayload = payloadBytes.toString('utf8');
    const values = canonicalPayload.split('|');
    if (values.length !== FIELDS.length || values.some(value => value === '')) {
      throw reject('missing_claim');
    }
    const claims = Object.fromEntries(FIELDS.map((field, index) => [field, values[index]]));

    if (claims.v !== VERSION) throw reject('wrong_version');
    if (claims.type !== TOKEN_TYPE) throw reject('wrong_type');
    if (claims.email.length > MAX_EMAIL_LENGTH || !EMAIL.test(claims.email)) throw reject('invalid_email');
    if (!PORTAL_ID.test(claims.portalId) || claims.portalId !== portalId) throw reject('wrong_portal');
    if (!SECONDS.test(claims.iat) || !SECONDS.test(claims.exp)) throw reject('invalid_time');
    if (!NONCE.test(claims.nonce)) throw reject('invalid_nonce');
    if (ZohoPeopleAssertion.canonicalize(claims) !== canonicalPayload) throw reject('not_canonical');

    const iat = Number(claims.iat);
    const exp = Number(claims.exp);
    if (exp <= iat || exp - iat > MAX_LIFETIME_SECONDS) throw reject('invalid_lifetime');
    if (iat > now + CLOCK_SKEW_SECONDS) throw reject('issued_in_future');
    if (now > exp + CLOCK_SKEW_SECONDS) throw reject('expired');

    return { ...claims, iat, exp };
  }
}

/**
 * Whether a value has the shape of a signed Employee 360 assertion (two
 * base64url parts whose payload starts with "1|e360_webtab|"). Used only to
 * label a misconfigured secret; it says nothing about validity.
 */
ZohoPeopleAssertion.isAssertionShaped = function isAssertionShaped(value) {
  if (typeof value !== 'string') return false;
  const parts = value.trim().split('.');
  if (parts.length !== 2) return false;
  const payload = decodeBase64Url(parts[0]);
  return Boolean(payload) && payload.toString('utf8').startsWith(`${VERSION}|${TOKEN_TYPE}|`);
};

ZohoPeopleAssertion.MIN_SECRET_LENGTH = MIN_SECRET_LENGTH;
ZohoPeopleAssertion.HEADER = 'x-e360-assertion';
ZohoPeopleAssertion.BODY_FIELD = 'e360Assertion';
ZohoPeopleAssertion.MAX_LIFETIME_SECONDS = MAX_LIFETIME_SECONDS;
ZohoPeopleAssertion.CLOCK_SKEW_SECONDS = CLOCK_SKEW_SECONDS;

module.exports = ZohoPeopleAssertion;
