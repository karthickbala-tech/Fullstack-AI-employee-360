'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { fn, silenceLogs } = require('./helpers');

const AuthorizationBoundary = fn('middleware/authorization');
const Environment = fn('config/environment');
const { UnauthorizedError, ForbiddenError } = fn('utils/errors');

// Test-only material; not a real secret.
const SECRET = 'test-only-secret-0123456789abcdefghijklmnop';
const PORTAL = Environment.getTenantConfig().portalId;

const DIRECTORY = [
  { employeeId: 'OWN01', fullName: 'Owen Manager', email: 'owner@example.com', reportingManagerId: null },
  { employeeId: 'HRM4', fullName: 'Priya Nair', email: 'priya@example.com', reportingManagerId: 'OWN01' },
  { employeeId: 'EMP006', fullName: 'Deepak Rao', email: 'deepak@example.com', reportingManagerId: 'OWN01' },
  { employeeId: 'HRM2', fullName: 'Sarah Lee', email: 'sarah@example.com', reportingManagerId: null },
  { employeeId: 'A1', fullName: 'Shared One', email: 'shared@example.com', reportingManagerId: null },
  { employeeId: 'A2', fullName: 'Shared Two', email: 'shared@example.com', reportingManagerId: null }
];

function assertion(email, { secret = SECRET, portalId = PORTAL } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = ['1', 'e360_webtab', email, portalId, now, now + 120, 'TestNonce_0123456789'].join('|');
  const signature = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest().toString('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

function setup(t, { secret = SECRET, organizationAccess } = {}) {
  silenceLogs(t);
  const originals = {
    secret: process.env.E360_IDENTITY_ASSERTION_SECRET,
    catalyst: AuthorizationBoundary._getCatalyst,
    service: AuthorizationBoundary._getEmployeeService,
    tenant: Environment.getTenantConfig
  };
  if (secret === null) delete process.env.E360_IDENTITY_ASSERTION_SECRET;
  else process.env.E360_IDENTITY_ASSERTION_SECRET = secret;

  const calls = { catalyst: 0 };
  AuthorizationBoundary._getCatalyst = () => {
    calls.catalyst += 1;
    return {
      initialize: () => ({
        userManagement: () => ({
          getCurrentUser: async () => ({ user_id: '1', email_id: 'admin@example.com', role_details: { role_name: 'App Administrator' } })
        })
      })
    };
  };
  AuthorizationBoundary._getEmployeeService = () => ({ getLiveEmployeeDirectory: async () => DIRECTORY });
  if (organizationAccess) {
    Environment.getTenantConfig = () => ({ ...originals.tenant.call(Environment), organizationAccess });
  }

  t.after(() => {
    if (originals.secret === undefined) delete process.env.E360_IDENTITY_ASSERTION_SECRET;
    else process.env.E360_IDENTITY_ASSERTION_SECRET = originals.secret;
    AuthorizationBoundary._getCatalyst = originals.catalyst;
    AuthorizationBoundary._getEmployeeService = originals.service;
    Environment.getTenantConfig = originals.tenant;
  });
  return calls;
}

async function signInWithAssertion(t, email, options = {}) {
  setup(t, options);
  const context = {};
  await AuthorizationBoundary.authenticate({ headers: { 'x-e360-assertion': assertion(email) } }, context);
  return context;
}

test('valid assertion authenticates through Zoho People, not Catalyst', async t => {
  const calls = setup(t);
  const context = {};
  await AuthorizationBoundary.authenticate({ headers: { 'x-e360-assertion': assertion('Priya@Example.com') } }, context);
  assert.equal(calls.catalyst, 0);
  assert.equal(context.user.identitySource, 'zoho_people');
  assert.equal(context.user.email, 'priya@example.com');
  assert.equal(context.user.employeeId, 'HRM4');
});

test('without an assertion the existing Catalyst authentication is used', async t => {
  const calls = setup(t);
  const context = {};
  await AuthorizationBoundary.authenticate({ headers: { 'x-zc-user-type': 'project-user' } }, context);
  assert.equal(calls.catalyst, 1);
  assert.equal(context.user.identitySource, 'catalyst');
  assert.equal(context.user.role, 'admin');
  assert.equal(context.user.scope, 'all');
});

test('an invalid assertion is 401 and never falls back to Catalyst', async t => {
  const calls = setup(t);
  for (const value of ['', 'garbage', assertion('priya@example.com', { secret: 'wrong-secret-0123456789abcdefghijklmnop' })]) {
    const context = {};
    // Valid Catalyst gateway headers are present too: they must not be used.
    await assert.rejects(
      AuthorizationBoundary.authenticate({ headers: { 'x-e360-assertion': value, 'x-zc-user-type': 'project-user' } }, context),
      err => err instanceof UnauthorizedError && err.statusCode === 401
    );
    assert.equal(context.user, undefined);
  }
  assert.equal(calls.catalyst, 0);
});

test('missing signing secret rejects every assertion', async t => {
  const calls = setup(t, { secret: null });
  await assert.rejects(
    AuthorizationBoundary.authenticate({ headers: { 'x-e360-assertion': assertion('priya@example.com') } }, {}),
    UnauthorizedError
  );
  assert.equal(calls.catalyst, 0);
});

test('an assertion for another portal is rejected', async t => {
  setup(t);
  await assert.rejects(
    AuthorizationBoundary.authenticate({ headers: { 'x-e360-assertion': assertion('priya@example.com', { portalId: '12345' }) } }, {}),
    UnauthorizedError
  );
});

test('unique employee email with no reportees is scoped to self', async t => {
  const context = await signInWithAssertion(t, 'priya@example.com');
  assert.equal(context.user.role, 'employee');
  assert.equal(context.user.scope, 'self');
  assert.deepEqual(context.user.allowedEmployeeIds, ['HRM4']);
  assert.throws(() => AuthorizationBoundary.enforceEmployeeScope(context, 'OWN01'), ForbiddenError);
});

test('a manager gets self plus verified direct reports', async t => {
  const context = await signInWithAssertion(t, 'owner@example.com');
  assert.equal(context.user.role, 'manager');
  assert.equal(context.user.scope, 'team');
  assert.deepEqual(context.user.allowedEmployeeIds, ['OWN01', 'HRM4', 'EMP006']);
  assert.throws(() => AuthorizationBoundary.enforceEmployeeScope(context, 'HRM2'), ForbiddenError);
  assert.throws(() => AuthorizationBoundary.requireAdmin(context), ForbiddenError);
});

test('a duplicate email match is denied any employee scope', async t => {
  const context = await signInWithAssertion(t, 'shared@example.com');
  assert.equal(context.user.employeeId, null);
  assert.deepEqual(context.user.allowedEmployeeIds, []);
  assert.throws(() => AuthorizationBoundary.enforceEmployeeScope(context, 'A1'), ForbiddenError);
});

test('an email with no employee match is denied any employee scope', async t => {
  const context = await signInWithAssertion(t, 'stranger@example.com');
  assert.equal(context.user.employeeId, null);
  assert.throws(() => AuthorizationBoundary.enforceEmployeeScope(context, 'HRM4'), ForbiddenError);
});

test('the default empty organization policy grants no organization scope', async t => {
  assert.deepEqual(Environment.getTenantConfig().organizationAccess, { employeeIds: [], zohoRoles: [] });
  const context = await signInWithAssertion(t, 'owner@example.com');
  assert.notEqual(context.user.scope, 'all');
  assert.equal(context.user.organizationAccess, undefined);
});

test('organization scope comes only from an explicitly listed employee ID', async t => {
  const context = await signInWithAssertion(t, 'sarah@example.com', { organizationAccess: { employeeIds: ['HRM2'], zohoRoles: [] } });
  assert.equal(context.user.scope, 'all');
  assert.equal(context.user.organizationAccess, true);
  assert.equal(AuthorizationBoundary.enforceEmployeeScope(context, 'OWN01'), true);
});

test('Zoho Role matching stays inactive until the field is verified', async t => {
  const context = await signInWithAssertion(t, 'sarah@example.com', { organizationAccess: { employeeIds: [], zohoRoles: ['Admin'] } });
  context.user.zohoRole = 'Admin';
  assert.equal(AuthorizationBoundary._hasOrganizationAccess(context.user, { employeeIds: [], zohoRoles: ['Admin'] }), false);
  assert.equal(context.user.scope, 'self');
});

test('the signing secret is read from the process environment only', t => {
  const original = process.env.E360_IDENTITY_ASSERTION_SECRET;
  t.after(() => {
    if (original === undefined) delete process.env.E360_IDENTITY_ASSERTION_SECRET;
    else process.env.E360_IDENTITY_ASSERTION_SECRET = original;
  });
  delete process.env.E360_IDENTITY_ASSERTION_SECRET;
  assert.equal(Environment.getIdentityAssertionSecret(), null);
  process.env.E360_IDENTITY_ASSERTION_SECRET = SECRET;
  assert.equal(Environment.getIdentityAssertionSecret(), SECRET);
});

function withAuthentication(t, enabled) {
  const original = Environment.isAuthenticationEnabled;
  Environment.isAuthenticationEnabled = () => enabled;
  t.after(() => { Environment.isAuthenticationEnabled = original; });
}

test('/v1/me describes a Zoho People manager with names and team analysis', async t => {
  const context = await signInWithAssertion(t, 'owner@example.com');
  withAuthentication(t, true);
  const me = AuthorizationBoundary.describeAccess(context);
  assert.equal(me.authenticationEnabled, true);
  assert.equal(me.identitySource, 'zoho_people');
  assert.equal(me.displayName, 'Owen Manager');
  assert.equal(me.role, 'manager');
  assert.equal(me.employeeId, 'OWN01');
  assert.deepEqual(me.allowedEmployeeIds, ['OWN01', 'HRM4', 'EMP006']);
  assert.deepEqual(me.allowedEmployees, [
    { employeeId: 'OWN01', fullName: 'Owen Manager' },
    { employeeId: 'HRM4', fullName: 'Priya Nair' },
    { employeeId: 'EMP006', fullName: 'Deepak Rao' }
  ]);
  assert.equal(me.canAnalyzeTeam, true);
  assert.equal(me.canAnalyzeOrganization, false);
});

test('/v1/me for an employee without reportees has no team or organization analysis', async t => {
  const context = await signInWithAssertion(t, 'priya@example.com');
  withAuthentication(t, true);
  const me = AuthorizationBoundary.describeAccess(context);
  assert.deepEqual(me.allowedEmployees, [{ employeeId: 'HRM4', fullName: 'Priya Nair' }]);
  assert.equal(me.canAnalyzeTeam, false);
  assert.equal(me.canAnalyzeOrganization, false);
});

test('/v1/me never derives organization analysis from the Catalyst admin role', async t => {
  setup(t);
  withAuthentication(t, true);
  const context = {};
  await AuthorizationBoundary.authenticate({ headers: { 'x-zc-user-type': 'project-user' } }, context);
  const me = AuthorizationBoundary.describeAccess(context);
  assert.equal(me.identitySource, 'catalyst');
  assert.equal(me.canAnalyzeOrganization, false);
});

test('an empty assertion header is rejected, not treated as absent', async t => {
  const calls = setup(t);
  await assert.rejects(
    AuthorizationBoundary.authenticate({ headers: { 'x-e360-assertion': '' } }, {}),
    err => err instanceof UnauthorizedError && err.code === 'INVALID_IDENTITY_ASSERTION'
  );
  assert.equal(calls.catalyst, 0);
});

test('no assertion and no Catalyst user is a plain 401 (not an assertion error)', async t => {
  setup(t);
  await assert.rejects(
    AuthorizationBoundary.authenticate({ headers: {} }, {}),
    err => err instanceof UnauthorizedError && err.code === 'UNAUTHORIZED'
  );
});

test('/v1/me reports whether the sign-in matched an employee record', async t => {
  withAuthentication(t, true);
  const cases = [['priya@example.com', 'matched'], ['stranger@example.com', 'not_found'], ['shared@example.com', 'ambiguous']];
  for (const [email, mapping] of cases) {
    const context = await signInWithAssertion(t, email);
    const me = AuthorizationBoundary.describeAccess(context);
    assert.equal(me.authenticated, true, email);
    assert.equal(me.employeeMapping, mapping, email);
    if (mapping !== 'matched') {
      assert.equal(me.employeeId, null);
      assert.deepEqual(me.allowedEmployees, []);
    }
  }
});

test('a manager can open a verified direct report but not an unrelated employee', async t => {
  withAuthentication(t, true);
  const context = await signInWithAssertion(t, 'owner@example.com');
  assert.equal(AuthorizationBoundary.authorizeEmployee(context, 'HRM4'), true);
  assert.throws(() => AuthorizationBoundary.authorizeEmployee(context, 'HRM2'), ForbiddenError);
  assert.throws(() => AuthorizationBoundary.authorizeAdmin(context), ForbiddenError);
});

test('an employee can open only their own record', async t => {
  withAuthentication(t, true);
  const context = await signInWithAssertion(t, 'priya@example.com');
  assert.equal(AuthorizationBoundary.authorizeEmployee(context, 'HRM4'), true);
  for (const other of ['OWN01', 'EMP006', 'HRM2']) {
    assert.throws(() => AuthorizationBoundary.authorizeEmployee(context, other), ForbiddenError);
  }
});

test('authentication switch remains off', () => {
  assert.equal(Environment.isAuthenticationEnabled(), false);
});
