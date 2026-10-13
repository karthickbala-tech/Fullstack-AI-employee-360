'use strict';

const path = require('path');

const FUNCTION_ROOT = path.resolve(__dirname, '../functions/employee_360_ai_function');

function fn(relativePath) {
  return require(path.join(FUNCTION_ROOT, relativePath));
}

// Tests describe behaviour, not this deployment's settings: every test file
// starts from authentication off and an empty organization policy, whatever
// config/environment.js ships with. Tests that need either opt in explicitly
// (stubbing Environment.isAuthenticationEnabled / getTenantConfig).
const Environment = fn('config/environment');
const deployedTenantConfig = Environment.getTenantConfig;
Environment.isAuthenticationEnabled = () => false;
// No cross-test reuse of the Zoho directory or request counts.
Environment.getDirectoryCacheTtlMs = () => 0;
Environment.getRateLimits = () => ({ ask: [1e6, 60000], transcribe: [1e6, 60000], speak: [1e6, 60000] });
Environment.getTenantConfig = () => ({
  ...deployedTenantConfig.call(Environment),
  organizationAccess: { employeeIds: [], zohoRoles: [] }
});

// Keeps test output readable: the service logs JSON lines to stdout/stderr.
function silenceLogs(t) {
  const out = process.stdout.write;
  const err = process.stderr.write;
  const isLogLine = chunk => typeof chunk === 'string' && chunk.startsWith('{"timestamp"');
  process.stdout.write = function (chunk, ...rest) {
    return isLogLine(chunk) ? true : out.call(this, chunk, ...rest);
  };
  process.stderr.write = function (chunk, ...rest) {
    return isLogLine(chunk) ? true : err.call(this, chunk, ...rest);
  };
  t.after(() => {
    process.stdout.write = out;
    process.stderr.write = err;
  });
}

function jsonResponse(body, status = 200, headers = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => headers[name.toLowerCase()] ?? null },
    text: async () => text
  };
}

module.exports = { fn, silenceLogs, jsonResponse };
