'use strict';

/**
 * Manual validation helper: checks one assertion produced by the Zoho People
 * function against the backend verifier, locally.
 *
 *   set E360_IDENTITY_ASSERTION_SECRET in your shell (never on the command line history if avoidable)
 *   node backend/tools/check-identity-assertion.js <assertion>
 *
 * Prints whether it verifies and, if it does, the email and remaining lifetime.
 * It never prints the secret or the signature.
 */

const path = require('path');
const ZohoPeopleAssertion = require(path.resolve(__dirname, '../functions/employee_360_ai_function/middleware/zohoPeopleAssertion'));
const Environment = require(path.resolve(__dirname, '../functions/employee_360_ai_function/config/environment'));

const token = (process.argv[2] || '').trim();
if (!token) {
  console.error('Usage: node backend/tools/check-identity-assertion.js <assertion>');
  process.exit(2);
}

try {
  const claims = ZohoPeopleAssertion.verify(token, {
    secret: Environment.getIdentityAssertionSecret(),
    portalId: Environment.getTenantConfig().portalId
  });
  const now = Math.floor(Date.now() / 1000);
  console.log(`VALID  email=${claims.email}  portal=${claims.portalId}  lifetime=${claims.exp - claims.iat}s  expiresIn=${claims.exp - now}s`);
} catch (err) {
  console.log(`INVALID  reason=${err.reason || err.message}`);
  process.exit(1);
}
