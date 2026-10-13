'use strict';

// POST /v1/ask (chat questions not tied to one employee) through the real
// index.js: scope from the signed-in user, every @/# mention authorized before
// data is read, group answers built only from people inside scope.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Readable } = require('stream');
const { fn } = require('./helpers');

const handler = fn('index');
const AuthorizationBoundary = fn('middleware/authorization');
const Environment = fn('config/environment');
const ZohoPeopleEmployeeService = fn('connectors/zohoPeople/zohoPeopleEmployeeService');
const AskGenerator = fn('ai/askGenerator');
const AIInteractionRepository = fn('repositories/aiInteractionRepository');
const GroupAnswers = fn('ai/groupAnswers');

// Test-only material; not a real secret.
const SECRET = 'test-only-secret-0123456789abcdefghijklmnop';
const PORTAL = Environment.getTenantConfig().portalId;

// OWN01 manages HRM4 and EMP006. HRM2 and X9 are outside OWN01's team.
const DIRECTORY = [
  { recordId: '1', employeeId: 'OWN01', fullName: 'Owen Manager', email: 'owner@example.com', department: 'Operations', status: 'Active', reportingManagerId: null },
  { recordId: '2', employeeId: 'HRM4', fullName: 'Priya Nair', email: 'priya@example.com', department: 'Information Technology', status: 'Active', reportingManagerId: 'OWN01' },
  { recordId: '3', employeeId: 'EMP006', fullName: 'Deepak Rao', email: 'deepak@example.com', department: 'Operations', status: 'Active', reportingManagerId: 'OWN01' },
  { recordId: '4', employeeId: 'HRM2', fullName: 'Sarah Lee', email: 'sarah@example.com', department: 'Finance', status: 'Active', reportingManagerId: null },
  { recordId: '5', employeeId: 'X9', fullName: 'Former Person', email: 'former@example.com', department: null, status: 'Inactive', reportingManagerId: null }
];

// Verified attendance per employee (present / total days, late days); none for X9.
const ATTENDANCE = {
  OWN01: { total_days: 20, present_days: 19, late_days: 1 },
  HRM4: { total_days: 20, present_days: 15, late_days: 4 },
  EMP006: { total_days: 20, present_days: 18, late_days: 2 },
  HRM2: { total_days: 20, present_days: 20, late_days: 0 }
};
const JOINED = { OWN01: '2019-04-01', HRM4: '2023-06-15', EMP006: '2024-01-10', HRM2: '2021-02-01' };

function assertion(email) {
  const now = Math.floor(Date.now() / 1000);
  const payload = ['1', 'e360_webtab', email, PORTAL, now, now + 120, 'TestNonce_0123456789'].join('|');
  const signature = crypto.createHmac('sha256', SECRET).update(payload, 'utf8').digest().toString('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

function setup(t, { authEnabled = false, organizationIds = [] } = {}) {
  const saved = {
    secret: process.env.E360_IDENTITY_ASSERTION_SECRET,
    auth: Environment.isAuthenticationEnabled,
    tenant: Environment.getTenantConfig,
    service: AuthorizationBoundary._getEmployeeService,
    directory: ZohoPeopleEmployeeService.prototype.getLiveEmployeeDirectory,
    raw: ZohoPeopleEmployeeService.prototype.getEmployeeRawData,
    general: AskGenerator.prototype.answerGeneral,
    single: AskGenerator.prototype.answerQuestion,
    group: AskGenerator.prototype.answerGroupQuestion,
    audit: AIInteractionRepository.prototype.logInteraction,
    stdout: process.stdout.write
  };
  process.env.E360_IDENTITY_ASSERTION_SECRET = SECRET;
  Environment.isAuthenticationEnabled = () => authEnabled;
  Environment.getTenantConfig = () => ({ ...saved.tenant.call(Environment), organizationAccess: { employeeIds: organizationIds, zohoRoles: [] } });

  const calls = { built: [], directory: 0, groupAi: [], singleAi: [], general: 0 };
  const directory = async () => { calls.directory += 1; return DIRECTORY; };
  AuthorizationBoundary._getEmployeeService = () => ({ getLiveEmployeeDirectory: directory });
  ZohoPeopleEmployeeService.prototype.getLiveEmployeeDirectory = directory;
  ZohoPeopleEmployeeService.prototype.getEmployeeRawData = async employeeId => {
    calls.built.push(employeeId);
    const entry = DIRECTORY.find(item => item.employeeId === employeeId);
    if (!entry) return { available: false };
    const [first, ...rest] = (entry.fullName || '').split(' ');
    return {
      available: true,
      recordId: entry.recordId,
      raw: { EmployeeID: employeeId, FirstName: first, LastName: rest.join(' '), Department: entry.department, Employeestatus: entry.status, Dateofjoining: JOINED[employeeId] || null },
      attendance: ATTENDANCE[employeeId] || null,
      lifecycle: {}
    };
  };
  AskGenerator.prototype.answerGeneral = async () => { calls.general += 1; return null; };
  AskGenerator.prototype.answerQuestion = async canonical => {
    calls.singleAi.push(canonical.metadata.employeeId);
    return { answer: `single answer for ${canonical.metadata.employeeId}`, type: 'Unknown', confidence: 'unknown', evidence: [], limitations: [] };
  };
  AskGenerator.prototype.answerGroupQuestion = async (records, question, history, label) => {
    calls.groupAi.push(records.map(r => r.canonical.metadata.employeeId).sort());
    return { answer: `group answer about ${label}`, type: 'Unknown', confidence: 'unknown', evidence: [], limitations: [] };
  };
  AIInteractionRepository.prototype.logInteraction = async () => {};
  process.stdout.write = function (chunk, ...rest) {
    return typeof chunk === 'string' && chunk.startsWith('{"timestamp"') ? true : saved.stdout.call(this, chunk, ...rest);
  };
  const stderr = process.stderr.write;
  process.stderr.write = function (chunk, ...rest) {
    return typeof chunk === 'string' && chunk.startsWith('{"timestamp"') ? true : stderr.call(this, chunk, ...rest);
  };

  t.after(() => {
    process.stdout.write = saved.stdout;
    process.stderr.write = stderr;
    if (saved.secret === undefined) delete process.env.E360_IDENTITY_ASSERTION_SECRET;
    else process.env.E360_IDENTITY_ASSERTION_SECRET = saved.secret;
    Environment.isAuthenticationEnabled = saved.auth;
    Environment.getTenantConfig = saved.tenant;
    AuthorizationBoundary._getEmployeeService = saved.service;
    ZohoPeopleEmployeeService.prototype.getLiveEmployeeDirectory = saved.directory;
    ZohoPeopleEmployeeService.prototype.getEmployeeRawData = saved.raw;
    AskGenerator.prototype.answerGeneral = saved.general;
    AskGenerator.prototype.answerQuestion = saved.single;
    AskGenerator.prototype.answerGroupQuestion = saved.group;
    AIInteractionRepository.prototype.logInteraction = saved.audit;
  });
  return calls;
}

async function call(path, body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.url = `/server/employee_360_ai_function${path}`;
  req.headers = { 'content-type': 'text/plain;charset=UTF-8' };
  const res = { status: null, body: '' };
  await new Promise(resolve => {
    res.writeHead = status => { res.status = status; };
    res.end = chunk => { res.body = chunk || ''; resolve(); };
    handler(req, res);
  });
  return { status: res.status, text: res.body, json: res.body ? JSON.parse(res.body) : null };
}

const ask = (question, extra = {}, email) =>
  call('/v1/ask', { question, ...extra, ...(email ? { e360Assertion: assertion(email) } : {}) });

// ---- Development (authentication off): everyone in scope, no "self" ---------

test('no mention: an organization question answers over everyone, from the directory only', async t => {
  const calls = setup(t);
  const res = await ask('How many active users are there?');
  assert.equal(res.status, 200);
  assert.equal(res.json.data.route, 'group');
  assert.match(res.json.data.answer, /\*\*4 active\*\* employees in the organization \(\*\*5\*\* employee records in total\)/);
  assert.deepEqual(res.json.data.scope, { label: 'the organization', memberCount: 5 });
  assert.deepEqual(calls.built, [], 'no per-employee records were read');
});

test('"active user" lists the active employees instead of the generic reply', async t => {
  setup(t);
  const res = await ask('active user');
  assert.equal(res.json.data.route, 'group');
  assert.match(res.json.data.answer, /\*\*4 active employees\*\* in the organization/);
  assert.match(res.json.data.answer, /Priya Nair \(HRM4\)/);
  assert.doesNotMatch(res.json.data.answer, /Former Person/);
});

test('headcount by department marks missing departments honestly', async t => {
  setup(t);
  const res = await ask('headcount by department');
  assert.match(res.json.data.answer, /\*\*Operations\*\*: 2/);
  assert.deepEqual(res.json.data.evidence, ['directory.employmentStatus', 'directory.department']);
});

test('a metric question ranks verified values and cites per-employee evidence', async t => {
  const calls = setup(t);
  const res = await ask('Who has the best attendance?');
  assert.equal(res.json.data.type, 'Calculation');
  assert.match(res.json.data.answer, /^\*\*Sarah Lee \(HRM2\)\*\* has the highest attendance in the organization: \*\*100%\*\*/);
  assert.match(res.json.data.answer, /Not recorded for: Former Person \(X9\)/);
  assert.ok(res.json.data.evidence.includes('HRM2:attendance.attendancePercentage'));
  assert.deepEqual([...calls.built].sort(), ['EMP006', 'HRM2', 'HRM4', 'OWN01', 'X9']);
});

test('performance comparisons are reported as unavailable, never ranked', async t => {
  const calls = setup(t);
  const res = await ask('Who is performing well this month?');
  assert.equal(res.json.data.type, 'Unknown');
  assert.match(res.json.data.answer, /Performance ratings aren't available/);
  assert.deepEqual(calls.built, []);
});

test('one @mention goes to the single-employee pipeline for that person', async t => {
  const calls = setup(t);
  const res = await ask('What is @Priya Nair working on?', { mentions: { employeeIds: ['HRM4'] } });
  assert.equal(res.status, 200);
  assert.deepEqual(calls.singleAi, ['HRM4']);
  assert.deepEqual(res.json.data.scope, { label: 'Priya Nair', memberCount: 1 });
});

test('#department narrows a group to that department', async t => {
  const calls = setup(t);
  const res = await ask('What is going on in #Operations?', { mentions: { departments: ['operations'] } });
  assert.deepEqual(calls.groupAi, [['EMP006', 'OWN01']]);
  assert.equal(res.json.data.scope.label, 'Operations');
});

test('"my" questions need a verified sign-in', async t => {
  const calls = setup(t);
  const res = await ask('What is my attendance?');
  assert.match(res.json.data.answer, /Sign-in isn't verified/);
  assert.deepEqual(calls.built, []);
});

// ---- Authentication on: scope comes from the verified identity --------------

test('an employee without reportees only ever gets their own record', async t => {
  const calls = setup(t, { authEnabled: true });
  // An organization question is refused politely, with no records read.
  const headcount = await ask('How many employees are there?', {}, 'priya@example.com');
  assert.equal(headcount.status, 200);
  assert.match(headcount.json.data.answer, /outside your access/);
  assert.deepEqual(calls.built, []);

  // Anything else without a mention is answered from the own record only.
  const own = await ask('What is my department?', {}, 'priya@example.com');
  assert.equal(own.status, 200);
  assert.match(own.json.data.answer, /Information Technology/);
  assert.deepEqual(calls.built, ['HRM4']);

  for (const mentions of [{ employeeIds: ['OWN01'] }, { all: true }, { departments: ['Finance'] }, { departments: ['Operations'] }]) {
    const denied = await ask('Tell me about them', { mentions }, 'priya@example.com');
    assert.equal(denied.status, 403, JSON.stringify(mentions));
  }
  assert.deepEqual(calls.built, ['HRM4'], 'nothing outside scope was read');
});

test('a manager gets self plus reportees, and is refused anyone else', async t => {
  const calls = setup(t, { authEnabled: true });
  const denied = await ask('How is @Sarah Lee doing?', { mentions: { employeeIds: ['HRM2'] } }, 'owner@example.com');
  assert.equal(denied.status, 403);

  const team = await ask('How many people are in my team?', {}, 'owner@example.com');
  assert.equal(team.json.data.scope.label, 'your team');
  assert.match(team.json.data.answer, /\*\*2 active\*\* employees in your team/);

  const all = await ask('@all average attendance', { mentions: { all: true } }, 'owner@example.com');
  assert.match(all.json.data.answer, /Average attendance in your team/);
  assert.deepEqual([...calls.built].sort(), ['EMP006', 'HRM4', 'OWN01']);
  for (const res of [team, all]) {
    assert.equal(/Sarah|HRM2|Former|X9/.test(res.text), false, 'no one outside the team appears');
  }
});

test('a manager\'s #department is limited to their own people in it', async t => {
  const calls = setup(t, { authEnabled: true });
  const res = await ask('Summarise #Operations', { mentions: { departments: ['Operations'] } }, 'owner@example.com');
  assert.equal(res.status, 200);
  assert.deepEqual(calls.groupAi, [['EMP006', 'OWN01']]);
  const finance = await ask('Summarise #Finance', { mentions: { departments: ['Finance'] } }, 'owner@example.com');
  assert.equal(finance.status, 403, 'a department with nobody in scope is refused');
});

test('organization access comes only from the explicit policy', async t => {
  setup(t, { authEnabled: true, organizationIds: ['HRM2'] });
  const res = await ask('How many active users are there?', {}, 'sarah@example.com');
  assert.match(res.json.data.answer, /\*\*4 active\*\* employees in the organization/);
  const mentioned = await ask('How is @Priya Nair doing?', { mentions: { employeeIds: ['HRM4'] } }, 'sarah@example.com');
  assert.equal(mentioned.status, 200);
});

test('/v1/me lists only mentionable people and departments in scope', async t => {
  setup(t, { authEnabled: true });
  const manager = (await call('/v1/me', { e360Assertion: assertion('owner@example.com') })).json.data.mentionable;
  assert.deepEqual(manager.employees.map(e => e.employeeId), ['OWN01', 'HRM4', 'EMP006']);
  assert.deepEqual(manager.departments, ['Information Technology', 'Operations']);
  assert.equal(manager.canMentionAll, true);
  assert.equal(manager.allScope, 'team');

  const employee = (await call('/v1/me', { e360Assertion: assertion('priya@example.com') })).json.data.mentionable;
  assert.deepEqual(employee.employees.map(e => e.employeeId), ['HRM4']);
  assert.equal(employee.canMentionAll, false);
  assert.equal(employee.allScope, 'self');
});

test('malformed mentions are rejected before anything runs', async t => {
  const calls = setup(t);
  for (const mentions of [[], { employeeIds: 'HRM4' }, { employeeIds: ['bad id!'] }, { departments: [''] }, { all: 'yes' }]) {
    const res = await ask('How many employees?', { mentions });
    assert.equal(res.status, 400, JSON.stringify(mentions));
  }
  assert.equal(calls.directory, 0);
});

// ---- GroupAnswers unit checks -------------------------------------------------

test('metric ordering: lowest, highest and average', () => {
  const metric = GroupAnswers.metricFor('late days');
  const record = (id, name, late) => ({ entry: { employeeId: id, fullName: name }, canonical: { attendance: { lateDays: late }, evidence: [{ domain: 'attendance', field: 'lateDays' }] } });
  const records = [record('A', 'Ann', 3), record('B', 'Bob', 0), record('C', 'Cid', 5)];
  assert.match(GroupAnswers.fromRecords('who has the least late days', metric, records, 'the team').answer, /^\*\*Bob \(B\)\*\* has the lowest late days/);
  assert.match(GroupAnswers.fromRecords('who is late the most', metric, records, 'the team').answer, /^\*\*Cid \(C\)\*\* has the highest late days/);
  assert.match(GroupAnswers.fromRecords('average late days', metric, records, 'the team').answer, /\*\*2.7 late days\*\*/);
});

test('evidence is cited only where the record actually has it', () => {
  const metric = GroupAnswers.metricFor('attendance');
  const records = [
    { entry: { employeeId: 'A', fullName: 'Ann' }, canonical: { deterministicMetrics: { attendancePercentage: { value: 90 } }, evidence: [{ domain: 'attendance', field: 'attendancePercentage' }] } },
    { entry: { employeeId: 'B', fullName: 'Bob' }, canonical: { deterministicMetrics: { attendancePercentage: { value: 80 } }, evidence: [] } }
  ];
  assert.deepEqual(GroupAnswers.fromRecords('compare attendance', metric, records, 'x').evidence, ['A:attendance.attendancePercentage']);
});
