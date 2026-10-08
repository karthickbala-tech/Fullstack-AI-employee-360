'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fn, silenceLogs } = require('./helpers');

const AuthorizationBoundary = fn('middleware/authorization');
const Router = fn('routes/index');
const { UnauthorizedError, ForbiddenError } = fn('utils/errors');

function stubCatalyst(t, getCurrentUser) {
  const original = AuthorizationBoundary._getCatalyst;
  const calls = [];
  AuthorizationBoundary._getCatalyst = () => ({
    initialize: (req, options) => {
      calls.push(options);
      return { userManagement: () => ({ getCurrentUser }) };
    }
  });
  t.after(() => { AuthorizationBoundary._getCatalyst = original; });
  return calls;
}

function stubDirectory(t, directory) {
  const original = AuthorizationBoundary._getEmployeeService;
  AuthorizationBoundary._getEmployeeService = () => ({
    findEmployeesByEmail: async email =>
      directory.filter(e => (e.email || '').toLowerCase() === email.toLowerCase())
  });
  t.after(() => { AuthorizationBoundary._getEmployeeService = original; });
}

test('request without a platform user type is rejected with 401', async t => {
  silenceLogs(t);
  await assert.rejects(
    AuthorizationBoundary.authenticate({ headers: {} }, {}),
    err => err instanceof UnauthorizedError && err.statusCode === 401
  );
});

test('request the gateway marked as admin (unauthenticated) is rejected with 401', async t => {
  silenceLogs(t);
  await assert.rejects(
    AuthorizationBoundary.authenticate({ headers: { 'x-zc-user-type': 'admin', authorization: 'Bearer x' } }, {}),
    err => err instanceof UnauthorizedError
  );
});

test('an Authorization header alone never grants access', async t => {
  silenceLogs(t);
  await assert.rejects(
    AuthorizationBoundary.authenticate({ headers: { authorization: 'Zoho-oauthtoken anything', cookie: 'a=b' } }, {}),
    err => err instanceof UnauthorizedError
  );
});

test('getCurrentUser failure is a 401, not a fallback identity', async t => {
  silenceLogs(t);
  stubCatalyst(t, async () => { throw new Error('invalid token'); });
  await assert.rejects(
    AuthorizationBoundary.authenticate({ headers: { 'x-zc-user-type': 'project-user' } }, {}),
    err => err instanceof UnauthorizedError
  );
});

test('App Administrator gets admin role and full scope; user scope is strict', async t => {
  silenceLogs(t);
  const calls = stubCatalyst(t, async () => ({
    user_id: '67649000000123456',
    email_id: 'admin@example.com',
    role_details: { role_name: 'App Administrator' }
  }));
  const context = {};
  await AuthorizationBoundary.authenticate({ headers: { 'x-zc-user-type': 'project-user' } }, context);
  assert.deepEqual(calls, [{ scope: 'user' }]);
  assert.equal(context.user.role, 'admin');
  assert.equal(context.user.scope, 'all');
  assert.equal(context.user.userId, '67649000000123456');
  assert.equal(AuthorizationBoundary.enforceEmployeeScope(context, 'ANY1'), true);
  assert.equal(AuthorizationBoundary.requireAdmin(context), true);
});

test('App User is scoped to the single employee matching their email', async t => {
  silenceLogs(t);
  stubCatalyst(t, async () => ({
    user_id: '1', email_id: 'Priya@Example.com', role_details: { role_name: 'App User' }
  }));
  stubDirectory(t, [
    { employeeId: 'HRM4', email: 'priya@example.com' },
    { employeeId: 'HRM3', email: 'rahul@example.com' }
  ]);
  const context = {};
  await AuthorizationBoundary.authenticate({ headers: { 'x-zc-user-type': 'project-user' } }, context);
  assert.equal(context.user.role, 'employee');
  assert.equal(context.user.scope, 'self');
  assert.equal(context.user.employeeId, 'HRM4');
  assert.equal(AuthorizationBoundary.enforceEmployeeScope(context, 'HRM4'), true);
  assert.throws(() => AuthorizationBoundary.enforceEmployeeScope(context, 'HRM3'), ForbiddenError);
  assert.throws(() => AuthorizationBoundary.requireAdmin(context), ForbiddenError);
});

test('ambiguous email match grants no employee scope', async t => {
  silenceLogs(t);
  stubCatalyst(t, async () => ({
    user_id: '1', email_id: 'shared@example.com', role_details: { role_name: 'App User' }
  }));
  stubDirectory(t, [
    { employeeId: 'A1', email: 'shared@example.com' },
    { employeeId: 'A2', email: 'shared@example.com' }
  ]);
  const context = {};
  await AuthorizationBoundary.authenticate({ headers: { 'x-zc-user-type': 'project-user' } }, context);
  assert.equal(context.user.employeeId, null);
  assert.throws(() => AuthorizationBoundary.enforceEmployeeScope(context, 'A1'), ForbiddenError);
});

test('missing user context is 401 for scope and admin checks', () => {
  assert.throws(() => AuthorizationBoundary.enforceEmployeeScope({}, 'X'), UnauthorizedError);
  assert.throws(() => AuthorizationBoundary.requireAdmin({}), UnauthorizedError);
});

test('only GET / and GET /health are public', () => {
  const pub = (method, url) => Router.isPublicRequest({ method, url });
  assert.equal(pub('GET', '/server/employee_360_ai_function/health'), true);
  assert.equal(pub('GET', '/server/employee_360_ai_function/'), true);
  assert.equal(pub('GET', '/health'), true);
  assert.equal(pub('POST', '/health'), false);
  assert.equal(pub('GET', '/server/employee_360_ai_function/v1/zoho/forms'), false);
  assert.equal(pub('GET', '/server/employee_360_ai_function/v1/employees/HRM2/360'), false);
  assert.equal(pub('GET', '/server/employee_360_ai_function/healthz'), false);
});
