'use strict';

// End to end through the real entry point (index.js): the Web Tab sends its
// identity assertion in a text/plain POST body (a CORS "simple" request, so the
// browser sends no preflight); API clients may use the x-e360-assertion header.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Readable } = require('stream');
const { fn, silenceLogs } = require('./helpers');

const handler = fn('index');
const AuthorizationBoundary = fn('middleware/authorization');
const Environment = fn('config/environment');
const ZohoPeopleEmployeeService = fn('connectors/zohoPeople/zohoPeopleEmployeeService');

const SECRET = 'test-only-secret-0123456789abcdefghijklmnop';
const PORTAL = Environment.getTenantConfig().portalId;
const DIRECTORY = [
  { employeeId: 'OWN01', fullName: 'Owen Manager', email: 'owner@example.com', reportingManagerId: null },
  { employeeId: 'HRM4', fullName: 'Priya Nair', email: 'priya@example.com', reportingManagerId: 'OWN01' },
  { employeeId: 'HRM2', fullName: 'Sarah Lee', email: 'sarah@example.com', reportingManagerId: null }
];

function assertion(email, { secret = SECRET } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = ['1', 'e360_webtab', email, PORTAL, now, now + 120, 'TestNonce_0123456789'].join('|');
  const signature = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest().toString('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

function setup(t, { authEnabled = true } = {}) {
  silenceLogs(t);
  const saved = {
    secret: process.env.E360_IDENTITY_ASSERTION_SECRET,
    auth: Environment.isAuthenticationEnabled,
    catalyst: AuthorizationBoundary._getCatalyst,
    service: AuthorizationBoundary._getEmployeeService,
    raw: ZohoPeopleEmployeeService.prototype.getEmployeeRawData
  };
  process.env.E360_IDENTITY_ASSERTION_SECRET = SECRET;
  Environment.isAuthenticationEnabled = () => authEnabled;
  const calls = { catalyst: 0, employeeData: 0 };
  AuthorizationBoundary._getCatalyst = () => { calls.catalyst += 1; throw new Error('Catalyst must not be used'); };
  AuthorizationBoundary._getEmployeeService = () => ({ getLiveEmployeeDirectory: async () => DIRECTORY });
  ZohoPeopleEmployeeService.prototype.getEmployeeRawData = async () => { calls.employeeData += 1; throw new Error('no data in this test'); };
  t.after(() => {
    if (saved.secret === undefined) delete process.env.E360_IDENTITY_ASSERTION_SECRET;
    else process.env.E360_IDENTITY_ASSERTION_SECRET = saved.secret;
    Environment.isAuthenticationEnabled = saved.auth;
    AuthorizationBoundary._getCatalyst = saved.catalyst;
    AuthorizationBoundary._getEmployeeService = saved.service;
    ZohoPeopleEmployeeService.prototype.getEmployeeRawData = saved.raw;
  });
  return calls;
}

async function call({ method = 'GET', path, headers = {}, body }) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]);
  req.method = method;
  req.url = `/server/employee_360_ai_function${path}`;
  req.headers = { 'content-type': 'text/plain;charset=UTF-8', ...headers };
  const res = { status: null, headers: null, body: '' };
  await new Promise(resolve => {
    res.writeHead = (status, responseHeaders) => { res.status = status; res.headers = responseHeaders; };
    res.end = chunk => { res.body = chunk || ''; resolve(); };
    handler(req, res);
  });
  return { status: res.status, headers: res.headers, json: res.body ? JSON.parse(res.body) : null };
}

test('the Web Tab transport: text/plain POST with the assertion in the body authenticates /v1/me', async t => {
  const calls = setup(t);
  const res = await call({ method: 'POST', path: '/v1/me', body: { e360Assertion: assertion('priya@example.com') } });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.identitySource, 'zoho_people');
  assert.equal(res.json.data.employeeId, 'HRM4');
  assert.deepEqual(res.json.data.allowedEmployeeIds, ['HRM4']);
  assert.equal(calls.catalyst, 0);
  assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
});

test('API clients can still use the x-e360-assertion header on GET', async t => {
  setup(t);
  const res = await call({ path: '/v1/me', headers: { 'x-e360-assertion': assertion('owner@example.com') } });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.role, 'manager');
  assert.deepEqual(res.json.data.allowedEmployeeIds, ['OWN01', 'HRM4']);
});

test('an assertion sent both in the header and in the body is rejected', async t => {
  const calls = setup(t);
  const token = assertion('priya@example.com');
  const res = await call({ method: 'POST', path: '/v1/me', headers: { 'x-e360-assertion': token }, body: { e360Assertion: token } });
  assert.equal(res.status, 401);
  assert.equal(res.json.error.code, 'INVALID_IDENTITY_ASSERTION');
  assert.equal(calls.catalyst, 0);
});

test('an invalid body assertion is 401 and never falls back to Catalyst', async t => {
  const calls = setup(t);
  for (const value of ['', 'garbage', 42, null, assertion('priya@example.com', { secret: 'wrong-secret-0123456789abcdefghijklmnop' })]) {
    const res = await call({ method: 'POST', path: '/v1/me', headers: { 'x-zc-user-type': 'project-user' }, body: { e360Assertion: value } });
    assert.equal(res.status, 401, String(value));
    assert.equal(res.json.error.code, 'INVALID_IDENTITY_ASSERTION');
  }
  assert.equal(calls.catalyst, 0);
});

test('no credentials at all is 401 UNAUTHORIZED, before any data', async t => {
  const calls = setup(t);
  const res = await call({ path: '/v1/employees/HRM4/360' });
  assert.equal(res.status, 401);
  assert.equal(res.json.error.code, 'UNAUTHORIZED');
  assert.equal(calls.employeeData, 0);
});

test('changing the employee ID in the URL cannot widen access on any employee route', async t => {
  const calls = setup(t);
  const token = assertion('priya@example.com');
  for (const route of ['360', 'summary', 'insights', 'timeline']) {
    const res = await call({ method: 'POST', path: `/v1/employees/HRM2/${route}`, body: { e360Assertion: token } });
    assert.equal(res.status, 403, route);
  }
  const ask = await call({ method: 'POST', path: '/v1/employees/HRM2/ask', body: { e360Assertion: token, question: 'What is my department?' } });
  assert.equal(ask.status, 403);
  const directory = await call({ method: 'POST', path: '/v1/zoho/employees', body: { e360Assertion: token } });
  assert.equal(directory.status, 403);
  const status = await call({ method: 'POST', path: '/v1/zoho/status', body: { e360Assertion: token } });
  assert.equal(status.status, 403);
  assert.equal(calls.employeeData, 0);
});

test('a manager reaches a verified report but not an unrelated employee', async t => {
  const calls = setup(t);
  const token = assertion('owner@example.com');
  const denied = await call({ method: 'POST', path: '/v1/employees/HRM2/360', body: { e360Assertion: token } });
  assert.equal(denied.status, 403);
  assert.equal(calls.employeeData, 0);
  // Allowed: the request passes authorization and reaches the data layer (stubbed to fail here).
  await call({ method: 'POST', path: '/v1/employees/HRM4/360', body: { e360Assertion: token } });
  assert.equal(calls.employeeData, 1);
});

test('Ask accepts the body assertion alongside the question and keeps it out of validation', async t => {
  setup(t);
  const res = await call({ method: 'POST', path: '/v1/employees/HRM4/ask', body: { e360Assertion: assertion('priya@example.com'), question: 'Hi' } });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.route, 'conversation');
  assert.equal(JSON.stringify(res.json).includes('e360webtab'), false);
});

test('the assertion is removed from the body even with authentication off', async t => {
  setup(t, { authEnabled: false });
  const req = { headers: {}, parsedBody: { e360Assertion: 'token-value', question: 'Hi' } };
  const credentials = AuthorizationBoundary.takeCredentials(req);
  assert.equal(credentials.present, true);
  assert.deepEqual(req.parsedBody, { question: 'Hi' });
  const res = await call({ method: 'POST', path: '/v1/me', body: { e360Assertion: 'anything' } });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.authenticationEnabled, false);
});

test('admin-only source routes still accept GET only, except status and employees', async t => {
  setup(t, { authEnabled: false });
  const res = await call({ method: 'POST', path: '/v1/zoho/forms', body: {} });
  assert.equal(res.status, 405);
});
