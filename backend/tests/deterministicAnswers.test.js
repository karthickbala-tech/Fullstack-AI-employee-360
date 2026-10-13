'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fn, silenceLogs } = require('./helpers');

const DeterministicAnswers = fn('ai/deterministicAnswers');
const Employee360Builder = fn('intelligence/employee360Builder');
const AskGenerator = fn('ai/askGenerator');
const AskService = fn('services/askService');

// Canonical data comes from the real builder, as it does on the Ask path.
function buildCanonical(rawOverrides = {}) {
  return Employee360Builder.build('HRM4', {
    available: true,
    recordId: '371370000000000004',
    raw: {
      EmployeeID: 'HRM4',
      FirstName: 'Priya',
      LastName: 'Nair',
      EmailID: 'priya@example.com',
      Designation: 'Assistant Manager',
      Department: 'Information Technology',
      Dateofjoining: '11-Sep-2020',
      Employeestatus: 'Active',
      Reporting_To: 'karthickbala OWN01',
      ...rawOverrides
    },
    lifecycle: {}
  });
}

function refs(canonical) {
  return canonical.evidence.map(e => `${e.domain}.${e.field}`);
}

test('builder emits evidence for the four employee-form fields only when present', () => {
  const full = refs(buildCanonical());
  for (const ref of ['organisation.department', 'employment.jobTitle', 'employment.employmentStatus', 'organisation.reportingManagerName']) {
    assert.ok(full.includes(ref), ref);
  }
  const empty = refs(buildCanonical({ Department: '', Designation: null, Employeestatus: undefined, Reporting_To: '  ' }));
  for (const ref of ['organisation.department', 'employment.jobTitle', 'employment.employmentStatus', 'organisation.reportingManagerName']) {
    assert.ok(!empty.includes(ref), ref);
  }
});

test('department questions answer from organisation.department with evidence', () => {
  const canonical = buildCanonical();
  for (const q of ['What is my department?', 'which department am I in', 'What department do I work in?', "What's my department"]) {
    assert.deepEqual(DeterministicAnswers.answer(q, canonical), {
      answer: 'Your department is **Information Technology**.',
      type: 'Fact',
      confidence: 'high',
      evidence: ['organisation.department'],
      limitations: []
    }, q);
  }
});

test('designation, joining date, tenure, manager and status answer from canonical data', () => {
  const canonical = buildCanonical();

  const designation = DeterministicAnswers.answer('What is my job title?', canonical);
  assert.equal(designation.answer, 'Your designation is **Assistant Manager**.');
  assert.deepEqual(designation.evidence, ['employment.jobTitle']);

  const joined = DeterministicAnswers.answer('When did I join?', canonical);
  assert.equal(joined.answer, 'You joined on **11-Sep-2020**.');
  assert.deepEqual(joined.evidence, ['employment.dateOfJoining']);

  const tenure = DeterministicAnswers.answer('How long have I worked here?', canonical);
  assert.equal(tenure.type, 'Calculation');
  assert.equal(tenure.answer, `You have worked here for **${canonical.deterministicMetrics.tenure.formatted}** (since 11-Sep-2020).`);
  assert.deepEqual(tenure.evidence, ['employment.tenure', 'employment.dateOfJoining']);

  const manager = DeterministicAnswers.answer('Who do I report to?', canonical);
  assert.equal(manager.answer, 'Your reporting manager is recorded in Zoho People as **karthickbala OWN01**.');
  assert.deepEqual(manager.evidence, ['organisation.reportingManagerName']);

  assert.equal(DeterministicAnswers.answer('What is my employment status?', canonical).answer, 'Your employment status is **Active**.');
  assert.equal(DeterministicAnswers.answer('Am I active?', canonical).answer, 'Yes, your employment status is **Active**.');
});

test('questions about the viewed employee use third-person wording', () => {
  const canonical = buildCanonical();
  assert.equal(
    DeterministicAnswers.answer("What is this employee's department?", canonical).answer,
    "This employee's department is **Information Technology**."
  );
});

test('missing department and manager are reported as not recorded, never fabricated', () => {
  const canonical = buildCanonical({ Department: null, Reporting_To: null });

  const department = DeterministicAnswers.answer('What is my department?', canonical);
  assert.equal(department.type, 'Unknown');
  assert.equal(department.confidence, 'unknown');
  assert.deepEqual(department.evidence, []);
  assert.match(department.answer, /isn't recorded/);

  const manager = DeterministicAnswers.answer('Who is my manager?', canonical);
  assert.equal(manager.type, 'Unknown');
  assert.deepEqual(manager.evidence, []);
  assert.match(manager.answer, /No reporting manager is recorded/);
  assert.doesNotMatch(manager.answer, /OWN01|karthick/);
});

test('missing joining date makes tenure unknown rather than estimated', () => {
  const tenure = DeterministicAnswers.answer('What is my tenure?', buildCanonical({ Dateofjoining: null }));
  assert.equal(tenure.type, 'Unknown');
  assert.deepEqual(tenure.evidence, []);
});

test('a factual answer without its evidence in canonical.evidence falls back to the AI path', () => {
  const canonical = buildCanonical();
  canonical.evidence = canonical.evidence.filter(e => e.field !== 'department');
  assert.equal(DeterministicAnswers.answer('What is my department?', canonical), null);
});

test('open-ended, leave and unsupported questions are not deterministic', () => {
  for (const q of [
    'Tell me about my performance',
    'Why is my attendance low?',
    'How many leaves do I have?',
    'What are my skills?',
    'What is my salary?',
    'Summarize my department history',
    'What is my department and how is my attendance?'
  ]) {
    assert.equal(DeterministicAnswers.match(q), null, q);
  }
});

function makeService(t) {
  silenceLogs(t);
  const service = new AskService();
  const prompts = [];
  service.askGenerator = new AskGenerator({
    model: 'stub-model',
    generateCompletion: async prompt => {
      prompts.push(prompt);
      return JSON.stringify({ answer: 'AI answer', type: 'Unknown', confidence: 'unknown', evidence: [], limitations: [] });
    }
  });
  const calls = { canonical: 0, audit: [] };
  service.employee360Service = {
    getCanonical360: async () => { calls.canonical += 1; return buildCanonical(); }
  };
  service.aiInteractionRepository = { logInteraction: async record => { calls.audit.push(record); } };
  return { service, prompts, calls };
}

test('deterministic questions never call the AI provider, including ones without strong HR keywords', async t => {
  const { service, prompts, calls } = makeService(t);
  for (const q of ['What is my department?', 'When did I join?', 'Who do I report to?', 'How long have I worked here?', 'Am I active?']) {
    const result = await service.ask('HRM4', q, {});
    assert.equal(result.route, 'deterministic', q);
  }
  assert.equal(prompts.length, 0);
  assert.equal(calls.canonical, 5);
  assert.equal(calls.audit.length, 5);
  assert.ok(calls.audit.every(record => record.model === null));
});

test('non-deterministic employee questions still use the AI employee path', async t => {
  const { service, prompts } = makeService(t);
  const result = await service.ask('HRM4', 'Tell me about my performance', {});
  assert.equal(result.route, 'employee');
  assert.equal(prompts.length, 1);
});

test('greetings and general questions keep their step 1 routes', async t => {
  const { service, calls } = makeService(t);
  assert.equal((await service.ask('HRM4', 'Hi', {})).route, 'conversation');
  assert.equal((await service.ask('HRM4', 'What is the capital of France?', {})).route, 'general');
  assert.equal(calls.canonical, 0);
});
