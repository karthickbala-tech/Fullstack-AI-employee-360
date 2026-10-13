'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('stream');
const { fn, silenceLogs } = require('./helpers');

const AuthorizationBoundary = fn('middleware/authorization');
const Environment = fn('config/environment');
const AskController = fn('controllers/askController');
const DeterministicAnswers = fn('ai/deterministicAnswers');
const Employee360Builder = fn('intelligence/employee360Builder');
const { ForbiddenError, UnauthorizedError } = fn('utils/errors');

// Verified relationships from Zoho People: HRM4 and EMP006 report to OWN01.
const DIRECTORY = [
  { employeeId: 'OWN01', email: 'owner@example.com', reportingManagerId: null },
  { employeeId: 'HRM4', email: 'priya@example.com', reportingManagerId: 'OWN01' },
  { employeeId: 'EMP006', email: 'deepak@example.com', reportingManagerId: 'OWN01' },
  { employeeId: 'HRM2', email: 'sarah@example.com', reportingManagerId: null },
  { employeeId: 'SELF1', email: 'loop@example.com', reportingManagerId: 'SELF1' }
];

function signIn(t, email, roleName = 'App User') {
  silenceLogs(t);
  const originalCatalyst = AuthorizationBoundary._getCatalyst;
  const originalService = AuthorizationBoundary._getEmployeeService;
  AuthorizationBoundary._getCatalyst = () => ({
    initialize: () => ({ userManagement: () => ({ getCurrentUser: async () => ({ user_id: '9', email_id: email, role_details: { role_name: roleName } }) }) })
  });
  AuthorizationBoundary._getEmployeeService = () => ({ getLiveEmployeeDirectory: async () => DIRECTORY });
  t.after(() => {
    AuthorizationBoundary._getCatalyst = originalCatalyst;
    AuthorizationBoundary._getEmployeeService = originalService;
  });
  const context = {};
  return AuthorizationBoundary.authenticate({ headers: { 'x-zc-user-type': 'project-user' } }, context).then(() => context);
}

function withAuthentication(t, enabled) {
  const original = Environment.isAuthenticationEnabled;
  Environment.isAuthenticationEnabled = () => enabled;
  t.after(() => { Environment.isAuthenticationEnabled = original; });
}

test('a manager is scoped to themselves plus verified direct reports', async t => {
  const context = await signIn(t, 'owner@example.com');
  assert.equal(context.user.role, 'manager');
  assert.equal(context.user.scope, 'team');
  assert.deepEqual(context.user.allowedEmployeeIds, ['OWN01', 'HRM4', 'EMP006']);
  assert.equal(AuthorizationBoundary.enforceEmployeeScope(context, 'HRM4'), true);
  assert.equal(AuthorizationBoundary.enforceEmployeeScope(context, 'EMP006'), true);
  assert.throws(() => AuthorizationBoundary.enforceEmployeeScope(context, 'HRM2'), ForbiddenError);
  assert.throws(() => AuthorizationBoundary.requireAdmin(context), ForbiddenError);
});

test('an employee without verified reports only sees themselves', async t => {
  const context = await signIn(t, 'priya@example.com');
  assert.equal(context.user.role, 'employee');
  assert.equal(context.user.scope, 'self');
  assert.deepEqual(context.user.allowedEmployeeIds, ['HRM4']);
  assert.throws(() => AuthorizationBoundary.enforceEmployeeScope(context, 'OWN01'), ForbiddenError);
});

test('a self-referencing manager relationship does not create a team', async t => {
  const context = await signIn(t, 'loop@example.com');
  assert.equal(context.user.scope, 'self');
  assert.deepEqual(context.user.allowedEmployeeIds, ['SELF1']);
});

test('an unknown email gets no employee scope at all', async t => {
  const context = await signIn(t, 'stranger@example.com');
  assert.deepEqual(context.user.allowedEmployeeIds, []);
  assert.throws(() => AuthorizationBoundary.enforceEmployeeScope(context, 'HRM4'), ForbiddenError);
});

test('route checks are open only while authentication is disabled', async t => {
  withAuthentication(t, false);
  assert.equal(AuthorizationBoundary.authorizeEmployee({}, 'HRM2'), true);
  assert.equal(AuthorizationBoundary.authorizeAdmin({}), true);
  assert.deepEqual(AuthorizationBoundary.describeAccess({}), {
    authenticationEnabled: false, role: 'development', scope: 'all', employeeId: null, allowedEmployeeIds: null
  });
});

test('with authentication enabled, route checks enforce scope and admin', async t => {
  withAuthentication(t, true);
  assert.throws(() => AuthorizationBoundary.authorizeEmployee({}, 'HRM2'), UnauthorizedError);
  const context = await signIn(t, 'owner@example.com');
  assert.equal(AuthorizationBoundary.authorizeEmployee(context, 'HRM4'), true);
  assert.throws(() => AuthorizationBoundary.authorizeEmployee(context, 'HRM2'), ForbiddenError);
  assert.throws(() => AuthorizationBoundary.authorizeAdmin(context), ForbiddenError);
  const me = AuthorizationBoundary.describeAccess(context);
  assert.equal(me.role, 'manager');
  assert.deepEqual(me.allowedEmployeeIds, ['OWN01', 'HRM4', 'EMP006']);
});

test('an out-of-scope Ask is refused before any Employee 360 or AI work', async t => {
  withAuthentication(t, true);
  const context = await signIn(t, 'priya@example.com');
  const controller = new AskController();
  let serviceCalled = false;
  controller.service = { ask: async () => { serviceCalled = true; return {}; } };
  const req = Readable.from([Buffer.from(JSON.stringify({ question: 'How much salary was provided this month for all employees?' }))]);
  req.headers = {};
  await assert.rejects(controller.handle(req, {}, { employeeId: 'HRM2' }, context), ForbiddenError);
  assert.equal(serviceCalled, false);
});

test('restricted field permissions remove the domain, its metrics, trends and evidence', t => {
  const original = Environment.getTenantConfig;
  Environment.getTenantConfig = () => ({ ...original.call(Environment), fieldPermissions: { attendance: 'none', leave: 'read', performance: 'read' } });
  t.after(() => { Environment.getTenantConfig = original; });

  const canonical = Employee360Builder.build('HRM4', {
    available: true,
    recordId: '1',
    raw: { EmployeeID: 'HRM4', Department: 'Information Technology' },
    attendance: { total_days: 20, present_days: 18, late_days: 5 },
    lifecycle: {}
  });
  assert.ok(canonical.evidence.some(e => e.domain === 'attendance'));

  const filtered = AuthorizationBoundary.filterAllowedFields({}, canonical);
  assert.deepEqual(filtered.attendance, { status: 'restricted' });
  assert.equal(filtered.deterministicMetrics.attendancePercentage.value, null);
  assert.ok(!filtered.evidence.some(e => e.domain === 'attendance'));
  assert.ok(!filtered.trends.some(tr => tr.domain === 'attendance'));
  assert.ok(filtered.evidence.some(e => e.field === 'department'));
  // The original canonical object is not mutated.
  assert.ok(canonical.evidence.some(e => e.domain === 'attendance'));
});

test('deterministic answers say "this employee" when the viewer is someone else', () => {
  const canonical = Employee360Builder.build('HRM4', {
    available: true, recordId: '1', raw: { EmployeeID: 'HRM4', Department: 'Information Technology' }, lifecycle: {}
  });
  assert.equal(
    DeterministicAnswers.answer('What is my department?', canonical, { viewerIsSubject: false }).answer,
    "This employee's department is **Information Technology**."
  );
  assert.equal(
    DeterministicAnswers.answer('What is my department?', canonical, { viewerIsSubject: true }).answer,
    'Your department is **Information Technology**.'
  );
});
