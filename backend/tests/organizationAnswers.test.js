'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fn, silenceLogs } = require('./helpers');

const OrganizationAnswers = fn('ai/organizationAnswers');
const AskService = fn('services/askService');
const AskGenerator = fn('ai/askGenerator');
const Environment = fn('config/environment');

const DIRECTORY = [
  { employeeId: 'OWN01', fullName: 'karthickbala', department: 'Management', status: 'Active', reportingManagerId: null },
  { employeeId: 'HRM4', fullName: 'Priya Nair', department: 'Information Technology', status: 'Active', reportingManagerId: 'OWN01' },
  { employeeId: 'EMP006', fullName: 'Deepak N', department: 'Information Technology', status: 'Active', reportingManagerId: 'OWN01' },
  { employeeId: 'HRM2', fullName: 'Sarah Sanders', department: null, status: 'Active', reportingManagerId: null },
  { employeeId: 'X9', fullName: 'Former Person', department: 'Sales', status: 'Resigned', reportingManagerId: 'OWN01' }
];

test('question matching', () => {
  const cases = {
    'How many employees are there?': 'headcount',
    'What is our headcount?': 'headcount',
    'How many employees are in each department?': 'departmentBreakdown',
    'Headcount by department': 'departmentBreakdown',
    'Who reports to me?': 'myReportees',
    'How many people report to me?': 'myReportees',
    'How much salary was provided this month for all employees?': 'compensation',
    'What is my salary?': 'compensation',
    "What is the organization's average attendance?": 'orgAttendanceLeave',
    'Which departments have the highest absence rate?': 'orgAttendanceLeave',
    'What is the total leave utilization across the company?': 'orgAttendanceLeave',
    'What is my department?': null,
    'How many leaves do I have?': null,
    'Tell me about my performance': null
  };
  for (const [question, key] of Object.entries(cases)) {
    assert.equal(OrganizationAnswers.match(question), key, question);
  }
});

const ORG = { organizationWide: true, viewerEmployeeId: 'OWN01', viewerIsSubject: true };
const SELF = { organizationWide: false, viewerEmployeeId: 'HRM4', viewerIsSubject: true };

test('headcount counts active employees from the directory', () => {
  const result = OrganizationAnswers.answer('headcount', ORG, DIRECTORY);
  assert.equal(result.answer, 'There are **4 active employees** in Zoho People (**5** employee records in total).');
  assert.equal(result.type, 'Calculation');
});

test('department breakdown groups active employees and labels missing departments', () => {
  const result = OrganizationAnswers.answer('departmentBreakdown', ORG, DIRECTORY);
  assert.equal(result.answer, [
    'Active employees by department:',
    '- **Information Technology**: 2',
    '- **Department not recorded**: 1',
    '- **Management**: 1'
  ].join('\n'));
});

test('organization-wide figures are refused without organization-wide access', () => {
  for (const key of ['headcount', 'departmentBreakdown']) {
    const result = OrganizationAnswers.answer(key, SELF, DIRECTORY);
    assert.equal(result.type, 'Unknown');
    assert.match(result.answer, /outside your access/);
    assert.doesNotMatch(result.answer, /\d/);
  }
});

test('reportees come only from verified reportingManagerId relationships', () => {
  const result = OrganizationAnswers.answer('myReportees', ORG, DIRECTORY);
  assert.equal(result.answer, '**3** people report to you: Priya Nair (HRM4), Deepak N (EMP006), Former Person (X9).');
  const none = OrganizationAnswers.answer('myReportees', SELF, DIRECTORY);
  assert.equal(none.answer, 'No one is recorded in Zoho People as reporting to you.');
});

test('pay questions are unavailable for every role, including organization-wide access', () => {
  for (const access of [ORG, SELF]) {
    const result = OrganizationAnswers.answer('compensation', access, DIRECTORY);
    assert.equal(result.type, 'Unknown');
    assert.match(result.answer, /no verified payroll source/);
  }
});

function makeService(t, { authEnabled, user = null }) {
  silenceLogs(t);
  const original = Environment.isAuthenticationEnabled;
  Environment.isAuthenticationEnabled = () => authEnabled;
  t.after(() => { Environment.isAuthenticationEnabled = original; });

  const service = new AskService();
  const calls = { directory: 0, canonical: 0, ai: 0 };
  service.directoryService = { getLiveEmployeeDirectory: async () => { calls.directory += 1; return DIRECTORY; } };
  service.employee360Service = { getCanonical360: async () => { calls.canonical += 1; throw new Error('not expected'); } };
  service.askGenerator = new AskGenerator({ model: 'stub', generateCompletion: async () => { calls.ai += 1; return ''; } });
  service.aiInteractionRepository = { logInteraction: async () => {} };
  return { service, calls, context: { user } };
}

test('an employee asking for company salary gets a refusal with no data lookups or AI', async t => {
  const { service, calls, context } = makeService(t, {
    authEnabled: true,
    user: { role: 'employee', scope: 'self', employeeId: 'HRM4', allowedEmployeeIds: ['HRM4'] }
  });
  const result = await service.ask('HRM4', 'How much salary was provided this month for all employees?', context);
  assert.equal(result.route, 'organization');
  assert.equal(result.type, 'Unknown');
  assert.deepEqual(calls, { directory: 0, canonical: 0, ai: 0 });
});

test('an employee asking for headcount is refused without reading the directory', async t => {
  const { service, calls, context } = makeService(t, {
    authEnabled: true,
    user: { role: 'employee', scope: 'self', employeeId: 'HRM4', allowedEmployeeIds: ['HRM4'] }
  });
  const result = await service.ask('HRM4', 'How many employees are there?', context);
  assert.match(result.answer, /outside your access/);
  assert.equal(calls.directory, 0);
});

test('an administrator gets the headcount; a manager gets their verified reports', async t => {
  const admin = makeService(t, { authEnabled: true, user: { role: 'admin', scope: 'all', employeeId: null } });
  const headcount = await admin.service.ask('HRM4', 'How many employees are there?', admin.context);
  assert.match(headcount.answer, /\*\*4 active employees\*\*/);
  assert.equal(admin.calls.ai, 0);

  const manager = makeService(t, {
    authEnabled: true,
    user: { role: 'manager', scope: 'team', employeeId: 'OWN01', allowedEmployeeIds: ['OWN01', 'HRM4', 'EMP006'] }
  });
  const team = await manager.service.ask('OWN01', 'Who reports to me?', manager.context);
  assert.match(team.answer, /Priya Nair \(HRM4\), Deepak N \(EMP006\)/);
  const refused = await manager.service.ask('OWN01', 'How many employees are in each department?', manager.context);
  assert.match(refused.answer, /outside your access/);
});

test('without authentication (Development) "me" is the viewed employee', async t => {
  const { service, context } = makeService(t, { authEnabled: false });
  const result = await service.ask('OWN01', 'Who reports to me?', context);
  assert.match(result.answer, /^\*\*3\*\* people report to you/);
});
