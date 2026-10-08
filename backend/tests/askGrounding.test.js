'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fn, silenceLogs } = require('./helpers');

const AskGenerator = fn('ai/askGenerator');
const AIContextBuilder = fn('ai/aiContextBuilder');
const Employee360Builder = fn('intelligence/employee360Builder');

function buildCanonical(extra = {}) {
  return Employee360Builder.build('HRM4', {
    available: true,
    recordId: '371370000000000004',
    raw: {
      EmployeeID: 'HRM4',
      FirstName: 'Priya',
      Department: 'Information Technology',
      Designation: 'Assistant Manager',
      Dateofjoining: '11-Sep-2020',
      Employeestatus: 'Active',
      Reporting_To: 'karthickbala OWN01'
    },
    lifecycle: {},
    ...extra
  });
}

function generatorReturning(t, payload) {
  silenceLogs(t);
  return new AskGenerator({
    model: 'stub-model',
    generateCompletion: async () => JSON.stringify(payload)
  });
}

const refs = canonical => canonical.evidence.map(e => `${e.domain}.${e.field}`);

test('attendance and leave metrics get evidence only when they could be calculated', () => {
  const withMetrics = buildCanonical({
    attendance: { total_days: 20, present_days: 18 },
    leave: [{ Name: 'Casual Leave', PermittedCount: 10, AvailedCount: 4, BalanceCount: 6 }]
  });
  assert.ok(refs(withMetrics).includes('attendance.attendancePercentage'));
  assert.ok(refs(withMetrics).includes('leave.leaveUtilization'));

  const without = buildCanonical();
  assert.ok(!refs(without).includes('attendance.attendancePercentage'));
  assert.ok(!refs(without).includes('leave.leaveUtilization'));
});

test('the AI context includes the recorded reporting manager', () => {
  const context = JSON.parse(AIContextBuilder.buildPromptContext(buildCanonical()));
  assert.equal(context.profile.reportingManager, 'karthickbala OWN01');
});

test('a Fact answer with empty evidence is rejected and falls back', async t => {
  const generator = generatorReturning(t, {
    answer: 'Your department is Information Technology.',
    type: 'Fact',
    confidence: 'high',
    evidence: [],
    limitations: []
  });
  const result = await generator.answerQuestion(buildCanonical(), 'Describe my department and role');
  assert.equal(result.type, 'Unknown');
  assert.deepEqual(result.evidence, []);
  assert.doesNotMatch(result.answer, /Describe my department/);
});

test('a Fact answer citing existing evidence is accepted', async t => {
  const generator = generatorReturning(t, {
    answer: 'You work in Information Technology.',
    type: 'Fact',
    confidence: 'high',
    evidence: ['organisation.department'],
    limitations: []
  });
  const result = await generator.answerQuestion(buildCanonical(), 'Describe my department and role');
  assert.equal(result.type, 'Fact');
  assert.deepEqual(result.evidence, ['organisation.department']);
});

test('an Unknown answer never carries high confidence', async t => {
  const generator = generatorReturning(t, {
    answer: 'Your performance rating is not recorded.',
    type: 'Unknown',
    confidence: 'high',
    evidence: [],
    limitations: ['Performance rating not evaluated']
  });
  const result = await generator.answerQuestion(buildCanonical(), 'How is my performance?');
  assert.equal(result.type, 'Unknown');
  assert.equal(result.confidence, 'unknown');
  assert.equal(result.answer, 'Your performance rating is not recorded.');
});

test('fabricated evidence still fails closed', async t => {
  const generator = generatorReturning(t, {
    answer: 'Your salary is high.',
    type: 'Fact',
    confidence: 'high',
    evidence: ['compensation.salary'],
    limitations: []
  });
  const result = await generator.answerQuestion(buildCanonical(), 'Describe my pay');
  assert.equal(result.type, 'Unknown');
  assert.doesNotMatch(result.answer, /salary is high/);
});
