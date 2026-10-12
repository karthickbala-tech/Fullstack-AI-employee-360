'use strict';

// Development-only identity diagnostic on /v1/me, end to end through the real
// entry point (index.js). It must verify a supplied assertion against the
// runtime secret without ever authenticating anyone, and leave every other
// response and access decision exactly as it was.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Readable } = require('stream');
const { fn } = require('./helpers');

const handler = fn('index');
const AuthorizationBoundary = fn('middleware/authorization');
const ZohoPeopleAssertion = fn('middleware/zohoPeopleAssertion');
const Environment = fn('config/environment');
const ZohoPeopleEmployeeService = fn('connectors/zohoPeople/zohoPeopleEmployeeService');
const MeController = fn('controllers/meController');

// Test-only material; not real secrets.
const SECRET = 'test-only-secret-0123456789abcdefghijklmnop';
const OTHER_SECRET = 'other-test-secret-0123456789abcdefghijklmn';
const PORTAL = Environment.getTenantConfig().portalId;
const DIRECTORY = [
  { employeeId: 'OWN01', fullName: 'Owen Manager', email: 'owner@example.com', reportingManagerId: null },
  { employeeId: 'HRM4', fullName: 'Priya Nair', email: 'priya@example.com', reportingManagerId: 'OWN01' },
  { employeeId: 'HRM2', fullName: 'Sarah Lee', email: 'sarah@example.com', reportingManagerId: null }
];
const DEV_ME = { authenticationEnabled: false, role: 'development', scope: 'all', employeeId: null, allowedEmployeeIds: null };
const CHECK_KEYS_VALID = ['allowedEmployeeCount', 'email', 'employeeMapping', 'reason', 'role', 'scope', 'secretState', 'valid'];
const CHECK_KEYS_INVALID = ['reason', 'secretState', 'valid'];

function assertion(email, { secret = SECRET, portalId = PORTAL, iat, lifetime = 120 } = {}) {
  const issued = iat ?? Math.floor(Date.now() / 1000);
  const payload = ['1', 'e360_webtab', email, portalId, issued, issued + lifetime, 'TestNonce_0123456789'].join('|');
  const signature = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest().toString('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

/** Captures every log line the service writes (instead of silencing them) so leaks can be checked. */
function setup(t, { authEnabled = false, diagnostics = 'enabled', secret = SECRET, directory = async () => DIRECTORY } = {}) {
  const saved = {
    secret: process.env.E360_IDENTITY_ASSERTION_SECRET,
    diagnostics: process.env.E360_IDENTITY_DIAGNOSTICS,
    auth: Environment.isAuthenticationEnabled,
    catalyst: AuthorizationBoundary._getCatalyst,
    service: AuthorizationBoundary._getEmployeeService,
    raw: ZohoPeopleEmployeeService.prototype.getEmployeeRawData,
    stdout: process.stdout.write,
    stderr: process.stderr.write
  };
  if (secret === null) delete process.env.E360_IDENTITY_ASSERTION_SECRET;
  else process.env.E360_IDENTITY_ASSERTION_SECRET = secret;
  if (diagnostics === null) delete process.env.E360_IDENTITY_DIAGNOSTICS;
  else process.env.E360_IDENTITY_DIAGNOSTICS = diagnostics;
  Environment.isAuthenticationEnabled = () => authEnabled;

  const calls = { catalyst: 0, directory: 0, directoryContexts: [], employeeData: 0, logs: [] };
  AuthorizationBoundary._getCatalyst = () => { calls.catalyst += 1; throw new Error('Catalyst must not be used'); };
  AuthorizationBoundary._getEmployeeService = () => ({
    getLiveEmployeeDirectory: async lookupContext => {
      calls.directory += 1;
      calls.directoryContexts.push(lookupContext);
      return directory(lookupContext);
    }
  });
  ZohoPeopleEmployeeService.prototype.getEmployeeRawData = async () => { calls.employeeData += 1; throw new Error('no data in this test'); };

  const capture = original => function (chunk, ...rest) {
    if (typeof chunk === 'string' && chunk.startsWith('{"timestamp"')) { calls.logs.push(chunk); return true; }
    return original.call(this, chunk, ...rest);
  };
  process.stdout.write = capture(saved.stdout);
  process.stderr.write = capture(saved.stderr);

  t.after(() => {
    process.stdout.write = saved.stdout;
    process.stderr.write = saved.stderr;
    if (saved.secret === undefined) delete process.env.E360_IDENTITY_ASSERTION_SECRET;
    else process.env.E360_IDENTITY_ASSERTION_SECRET = saved.secret;
    if (saved.diagnostics === undefined) delete process.env.E360_IDENTITY_DIAGNOSTICS;
    else process.env.E360_IDENTITY_DIAGNOSTICS = saved.diagnostics;
    Environment.isAuthenticationEnabled = saved.auth;
    AuthorizationBoundary._getCatalyst = saved.catalyst;
    AuthorizationBoundary._getEmployeeService = saved.service;
    ZohoPeopleEmployeeService.prototype.getEmployeeRawData = saved.raw;
  });
  return calls;
}

async function call({ method = 'POST', path = '/v1/me', headers = {}, body }) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.url = `/server/employee_360_ai_function${path}`;
  req.headers = { 'content-type': 'text/plain;charset=UTF-8', ...headers };
  const res = { status: null, body: '' };
  await new Promise(resolve => {
    res.writeHead = status => { res.status = status; };
    res.end = chunk => { res.body = chunk || ''; resolve(); };
    handler(req, res);
  });
  return { status: res.status, text: res.body, json: res.body ? JSON.parse(res.body) : null };
}

const me = (token, headers) => call({ body: token === undefined ? undefined : { e360Assertion: token }, headers });

// ---- Response compatibility and gating --------------------------------------

test('diagnostics switch off: /v1/me is exactly the development response, assertion or not', async t => {
  for (const diagnostics of [null, '', 'true', 'ENABLED', 'disabled']) {
    const calls = setup(t, { diagnostics });
    const withToken = await me(assertion('owner@example.com'));
    assert.equal(withToken.status, 200);
    assert.deepEqual(withToken.json.data, DEV_ME, `switch=${diagnostics}`);
    assert.equal(calls.directory, 0);
  }
});

test('switch on but no assertion: /v1/me is exactly the development response (GET and POST)', async t => {
  const calls = setup(t);
  assert.deepEqual((await call({ method: 'GET' })).json.data, DEV_ME);
  assert.deepEqual((await me(undefined)).json.data, DEV_ME);
  assert.deepEqual((await call({ body: {} })).json.data, DEV_ME);
  assert.equal(calls.directory, 0);
});

test('another x-zc-environment value turns the diagnostic off', async t => {
  setup(t);
  for (const environment of ['Production', 'production', 'staging']) {
    const res = await me(assertion('owner@example.com'), { 'x-zc-environment': environment });
    assert.deepEqual(res.json.data, DEV_ME, environment);
  }
  const dev = await me(assertion('owner@example.com'), { 'x-zc-environment': 'Development' });
  assert.equal(dev.json.data.assertionCheck.valid, true);
});

test('with authentication on there is no diagnostic: normal authenticated /v1/me only', async t => {
  setup(t, { authEnabled: true });
  const res = await me(assertion('owner@example.com'));
  assert.equal(res.status, 200);
  assert.equal(res.json.data.identitySource, 'zoho_people');
  assert.equal('assertionCheck' in res.json.data, false);
});

// ---- Valid and invalid assertions -------------------------------------------

test('a valid assertion reports what authentication would grant, using the runtime secret', async t => {
  const calls = setup(t);
  const res = await me(assertion('Owner@Example.com'));
  assert.equal(res.status, 200);
  const { assertionCheck, ...rest } = res.json.data;
  assert.deepEqual(rest, DEV_ME, 'the rest of the response is unchanged');
  assert.deepEqual(Object.keys(assertionCheck).sort(), CHECK_KEYS_VALID);
  assert.deepEqual(assertionCheck, {
    valid: true,
    reason: null,
    secretState: 'ok',
    email: 'owner@example.com',
    employeeMapping: 'matched',
    role: 'manager',
    scope: 'team',
    allowedEmployeeCount: 2
  });
  assert.equal(calls.catalyst, 0);
});

test('employee and unmatched identities are reported without other employees\' data', async t => {
  setup(t);
  const employee = (await me(assertion('priya@example.com'))).json.data.assertionCheck;
  assert.equal(employee.scope, 'self');
  assert.equal(employee.allowedEmployeeCount, 1);
  const stranger = (await me(assertion('stranger@example.com'))).json.data.assertionCheck;
  assert.equal(stranger.valid, true);
  assert.equal(stranger.employeeMapping, 'not_found');
  assert.equal(stranger.allowedEmployeeCount, 0);
});

test('invalid assertions report the verifier reason and nothing else', async t => {
  setup(t);
  const now = Math.floor(Date.now() / 1000);
  const cases = [
    [assertion('owner@example.com', { secret: OTHER_SECRET }), 'bad_signature'],
    [assertion('owner@example.com', { portalId: '12345678901' }), 'wrong_portal'],
    [assertion('owner@example.com', { iat: now - 1000, lifetime: 240 }), 'expired'],
    ['garbage', 'malformed'],
    ['', 'malformed'],
    [42, 'malformed']
  ];
  for (const [token, reason] of cases) {
    const check = (await me(token)).json.data.assertionCheck;
    assert.deepEqual(Object.keys(check).sort(), CHECK_KEYS_INVALID, reason);
    assert.equal(check.valid, false, reason);
    assert.equal(check.reason, reason);
    assert.equal(check.secretState, 'ok');
  }
});

test('an assertion sent in both header and body is reported, not verified', async t => {
  const calls = setup(t);
  const token = assertion('owner@example.com');
  const check = (await me(token, { 'x-e360-assertion': token })).json.data.assertionCheck;
  assert.deepEqual(check, { valid: false, reason: 'sent_twice', secretState: 'ok' });
  assert.equal(calls.directory, 0);
});

test('a directory failure after a valid assertion is reported as lookup_failed', async t => {
  setup(t, { directory: async () => { throw new Error('Zoho People unavailable'); } });
  const check = (await me(assertion('owner@example.com'))).json.data.assertionCheck;
  assert.equal(check.valid, true);
  assert.equal(check.employeeMapping, 'lookup_failed');
  assert.equal('role' in check, false);
});

// ---- Secret classification, checked against the verifier contract -----------

test('secret states match what the verifier actually does with that secret', async t => {
  const assertionShapedSecret = assertion('someone@example.com', { secret: OTHER_SECRET });
  const cases = [
    [null, 'missing'],
    ['short-secret', 'too_short'],
    ['x'.repeat(ZohoPeopleAssertion.MIN_SECRET_LENGTH - 1), 'too_short'],
    [assertionShapedSecret, 'assertion_shaped'],
    ['x'.repeat(ZohoPeopleAssertion.MIN_SECRET_LENGTH), 'ok'],
    [SECRET, 'ok']
  ];
  for (const [secret, state] of cases) {
    setup(t, { secret });
    const check = (await me(assertion('owner@example.com', { secret: secret || SECRET }))).json.data.assertionCheck;
    assert.equal(check.secretState, state, state);

    // The same secret, given straight to the verifier with a token it signed:
    let verifierReason = null;
    try {
      ZohoPeopleAssertion.verify(assertion('owner@example.com', { secret: secret || SECRET }), { secret, portalId: PORTAL });
    } catch (err) {
      verifierReason = err.reason;
    }
    if (state === 'missing' || state === 'too_short') {
      assert.equal(verifierReason, 'secret_not_configured', state);
      assert.equal(check.valid, false);
      assert.equal(check.reason, 'secret_not_configured');
    } else {
      assert.equal(verifierReason, null, `${state}: the verifier accepts this secret`);
      assert.equal(check.valid, true, state);
    }
  }
});

test('a secret containing whitespace is flagged, checked against the verifier', async t => {
  const MIN = ZohoPeopleAssertion.MIN_SECRET_LENGTH;
  const cases = [
    ['leading space', ` ${SECRET}`, 'has_whitespace'],
    ['trailing space', `${SECRET} `, 'has_whitespace'],
    ['trailing CR/LF', `${SECRET}\r\n`, 'has_whitespace'],
    ['trailing LF', `${SECRET}\n`, 'has_whitespace'],
    ['tab inside', `${SECRET.slice(0, 20)}\t${SECRET.slice(20)}`, 'has_whitespace'],
    ['all whitespace, long enough', ' '.repeat(MIN + 8), 'has_whitespace'],
    ['all whitespace, mixed', ' \r\n\t'.repeat(10), 'has_whitespace'],
    ['all whitespace, too short', ' '.repeat(MIN - 1), 'too_short'],
    ['short with whitespace', 'short secret\n', 'too_short'],
    ['assertion pasted with CR/LF', `${assertion('someone@example.com', { secret: OTHER_SECRET })}\r\n`, 'assertion_shaped']
  ];
  for (const [label, secret, state] of cases) {
    setup(t, { secret });
    // A token signed with the value minus all whitespace: what Zoho People would sign with.
    const check = (await me(assertion('owner@example.com', { secret: secret.replace(/\s/g, '') || SECRET }))).json.data.assertionCheck;
    assert.equal(check.secretState, state, label);

    // The verifier's own acceptance rule for this exact secret.
    let verifierReason = null;
    try {
      ZohoPeopleAssertion.verify(assertion('owner@example.com', { secret }), { secret, portalId: PORTAL });
    } catch (err) {
      verifierReason = err.reason;
    }
    if (state === 'too_short') {
      assert.equal(verifierReason, 'secret_not_configured', `${label}: verifier rejects it`);
      assert.equal(check.reason, 'secret_not_configured', label);
    } else {
      assert.equal(verifierReason, null, `${label}: verifier accepts this exact secret (rules unchanged)`);
      assert.equal(check.valid, false, label);
      assert.equal(check.reason, 'bad_signature', `${label}: a token signed without the whitespace cannot match`);
    }
  }
});

test('the classification label never carries the secret or its length', async t => {
  const secret = `${SECRET}\r\n`;
  const calls = setup(t, { secret });
  const res = await me(assertion('owner@example.com', { secret: SECRET }));
  const check = res.json.data.assertionCheck;
  assert.deepEqual(Object.keys(check).sort(), CHECK_KEYS_INVALID);
  assert.equal(check.secretState, 'has_whitespace');
  // Only a label: no field carries the secret, part of it, or a number.
  assert.ok(Object.values(check).every(value => value === null || typeof value === 'boolean' || typeof value === 'string'));
  assert.ok([check.reason, check.secretState].every(value => !String(value).includes(SECRET.slice(0, 8))));
  const output = res.text + calls.logs.join('\n');
  assert.equal(output.includes(SECRET), false);
});

test('a real assertion pasted as the secret is flagged, and real tokens then fail', async t => {
  setup(t, { secret: assertion('someone@example.com', { secret: OTHER_SECRET }) });
  const check = (await me(assertion('owner@example.com'))).json.data.assertionCheck;
  assert.equal(check.secretState, 'assertion_shaped');
  assert.equal(check.reason, 'bad_signature');
});

// ---- Leakage ------------------------------------------------------------------

test('no token, payload, signature, secret or other employees\' data in responses or logs', async t => {
  const calls = setup(t);
  const tokens = [
    assertion('owner@example.com'),
    assertion('owner@example.com', { secret: OTHER_SECRET }),
    assertion('priya@example.com')
  ];
  const texts = [];
  for (const token of tokens) texts.push((await me(token)).text);
  assert.ok(calls.logs.some(line => line.includes('Identity assertion diagnostic')), 'diagnostic log lines were captured');
  const output = texts.join('\n') + '\n' + calls.logs.join('\n');

  const forbidden = [SECRET, OTHER_SECRET, 'HRM4', 'HRM2', 'OWN01', 'Priya Nair', 'Sarah Lee', 'Owen Manager', 'sarah@example.com', 'TestNonce_0123456789'];
  for (const token of tokens) {
    const [payload, signature] = token.split('.');
    forbidden.push(token, payload, signature);
  }
  for (const value of forbidden) {
    assert.equal(output.includes(value), false, `leaked: ${value.slice(0, 12)}…`);
  }
  // The manager's own reports are counted, never listed.
  assert.ok(texts[0].includes('"allowedEmployeeCount":2'));
});

// ---- No authorization side effects ---------------------------------------------

test('the diagnostic never sets context.user', async t => {
  setup(t);
  const controller = new MeController();
  const token = assertion('owner@example.com');
  const req = { headers: {}, e360Credentials: { present: true, conflicting: false, token } };
  const context = {};
  let sent = null;
  const res = { writeHead: () => {}, end: chunk => { sent = JSON.parse(chunk); } };
  await controller.handle(req, res, {}, context);
  assert.equal(sent.data.assertionCheck.valid, true);
  assert.equal(context.user, undefined);
});

// ---- Request context for the employee lookup (regression: lookup_failed on Development) ----

// Like the real connector: the Zoho People connection is reached through
// catalyst.initialize(req), so a lookup context without the request fails.
const directoryNeedingRequest = async lookupContext => {
  if (!lookupContext || !lookupContext.req) throw new Error('Catalyst connection needs the request');
  return DIRECTORY;
};

test('the employee lookup receives the real request and tenant settings, so mapping succeeds', async t => {
  const calls = setup(t, { directory: directoryNeedingRequest });
  const res = await me(assertion('owner@example.com'));
  const check = res.json.data.assertionCheck;
  assert.equal(check.valid, true);
  assert.equal(check.employeeMapping, 'matched', 'before the fix this was lookup_failed');
  assert.equal(check.role, 'manager');

  assert.equal(calls.directoryContexts.length, 1);
  const lookupContext = calls.directoryContexts[0];
  assert.equal(lookupContext.req.method, 'POST');
  assert.match(lookupContext.req.url, /\/v1\/me$/);
  const tenant = Environment.getTenantConfig();
  assert.equal(lookupContext.dataCenter, tenant.dataCenter);
  assert.equal(lookupContext.portalId, tenant.portalId);
  assert.equal(lookupContext.tenantId, tenant.tenantId);
  assert.equal(typeof lookupContext.requestId, 'string');
});

test('the diagnostic uses a separate context and leaves the request context exactly as it was', async t => {
  const calls = setup(t, { directory: directoryNeedingRequest });
  const controller = new MeController();
  const token = assertion('owner@example.com');
  const req = { method: 'POST', url: '/v1/me', headers: {}, e360Credentials: { present: true, conflicting: false, token } };
  const sentinelUser = Object.freeze({ marker: 'unchanged' });
  const context = { req, requestId: 'req-1', tenantId: 'vsk_hr_solution', portalId: PORTAL, dataCenter: 'in', timestamp: 't', user: sentinelUser };
  const before = { ...context };
  let sent = null;
  const res = { writeHead: () => {}, end: chunk => { sent = JSON.parse(chunk); } };

  await controller.handle(req, res, {}, context);

  assert.equal(sent.data.assertionCheck.employeeMapping, 'matched');
  // The original context: same keys, same values, same user object, nothing added.
  assert.deepEqual(Object.keys(context).sort(), Object.keys(before).sort());
  for (const key of Object.keys(before)) assert.equal(context[key], before[key], key);
  assert.equal(context.user, sentinelUser);
  // The lookup ran on a different object that shares only the request.
  const lookupContext = calls.directoryContexts[0];
  assert.notEqual(lookupContext, context);
  assert.equal(lookupContext.req, req);
  assert.notEqual(lookupContext.user, sentinelUser, 'the lookup context never starts from the caller\'s user');
});

test('without a user in the request context, none is created by the diagnostic', async t => {
  setup(t, { directory: directoryNeedingRequest });
  const controller = new MeController();
  const req = { method: 'POST', url: '/v1/me', headers: {}, e360Credentials: { present: true, conflicting: false, token: assertion('priya@example.com') } };
  const context = { req, requestId: 'req-2', tenantId: 'vsk_hr_solution', portalId: PORTAL, dataCenter: 'in', timestamp: 't', user: null };
  const res = { writeHead: () => {}, end: () => {} };
  await controller.handle(req, res, {}, context);
  assert.equal(context.user, null);
});

test('a successful lookup response carries no IDs, directory data, request data or secrets', async t => {
  const calls = setup(t, { directory: directoryNeedingRequest });
  const token = assertion('owner@example.com');
  const res = await me(token);
  const check = res.json.data.assertionCheck;
  assert.deepEqual(Object.keys(check).sort(), CHECK_KEYS_VALID);
  const output = res.text + '\n' + calls.logs.join('\n');
  for (const value of [token, ...token.split('.'), SECRET, 'OWN01', 'HRM4', 'HRM2', 'Priya Nair', 'Sarah Lee', 'Owen Manager', 'priya@example.com', 'sarah@example.com', 'requestId', 'dataCenter', 'tenantId']) {
    assert.equal(output.includes(value), false, `leaked: ${value.slice(0, 12)}…`);
  }
});

test('employee-route access is unchanged while the diagnostic is on', async t => {
  // Authentication off: routes stay open exactly as before; the assertion grants nothing extra.
  const off = setup(t);
  const open = await call({ path: '/v1/employees/HRM2/360', body: { e360Assertion: assertion('priya@example.com') } });
  assert.equal('assertionCheck' in (open.json.data || {}), false);
  assert.equal(off.employeeData, 1, 'request reached the data layer as it did before');
});

test('employee-route scope is still enforced when authentication is on', async t => {
  const on = setup(t, { authEnabled: true });
  const token = assertion('priya@example.com');
  const denied = await call({ path: '/v1/employees/HRM2/360', body: { e360Assertion: token } });
  assert.equal(denied.status, 403);
  assert.equal(on.employeeData, 0);
  const noToken = await call({ path: '/v1/employees/HRM4/360' });
  assert.equal(noToken.status, 401);
});
