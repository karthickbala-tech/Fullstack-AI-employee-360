'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fn, silenceLogs } = require('./helpers');

const SummaryGenerator = fn('ai/summaryGenerator');
const Employee360Builder = fn('intelligence/employee360Builder');

function buildCanonical(rawOverrides = {}, extra = {}) {
  return Employee360Builder.build('HRM4', {
    available: true,
    recordId: '371370000000000004',
    raw: {
      EmployeeID: 'HRM4',
      FirstName: 'Priya',
      LastName: 'Nair',
      Designation: 'Assistant Manager',
      Department: 'Information Technology',
      Dateofjoining: '11-Sep-2020',
      Employeestatus: 'Active',
      ...rawOverrides
    },
    lifecycle: {},
    ...extra
  });
}

function generatorReturning(t, reply) {
  silenceLogs(t);
  const calls = [];
  const generator = new SummaryGenerator({
    model: 'stub-model',
    generateCompletion: async (prompt, options) => {
      calls.push({ prompt, options });
      if (reply instanceof Error) throw reply;
      return reply;
    }
  });
  return { generator, calls };
}

test('multi-paragraph or list output is collapsed into one paragraph', async t => {
  const { generator, calls } = generatorReturning(t, '## Summary\n\nPriya is an **Assistant Manager**.\n\n- Tenure is **6 yrs**.\n\nAttendance is not recorded.');
  const result = await generator.generateSummary(buildCanonical());
  assert.equal(result.isAiGenerated, true);
  assert.equal(result.summary, 'Summary Priya is an **Assistant Manager**. Tenure is **6 yrs**. Attendance is not recorded.');
  assert.doesNotMatch(result.summary, /\n/);
  assert.match(calls[0].options.systemInstruction, /exactly ONE concise paragraph/);
});

test('output that leaks evidence references falls back to the deterministic summary', async t => {
  const { generator } = generatorReturning(t, 'Priya joined in 2020 (employment.dateOfJoining).');
  const result = await generator.generateSummary(buildCanonical());
  assert.equal(result.isAiGenerated, false);
  assert.doesNotMatch(result.summary, /employment\.dateOfJoining/);
});

test('deterministic summary is one bolded paragraph built only from recorded fields', async t => {
  const { generator } = generatorReturning(t, new Error('Gemini down'));
  const canonical = buildCanonical();
  const result = await generator.generateSummary(canonical);
  assert.equal(result.isAiGenerated, false);
  assert.doesNotMatch(result.summary, /\n/);
  assert.match(result.summary, /^\*\*Priya Nair\*\* is an \*\*Assistant Manager\*\* in \*\*Information Technology\*\* with \*\*.+\*\* of tenure \(joined 11-Sep-2020\)\./);
  assert.match(result.summary, /Employment status is \*\*Active\*\*\./);
  assert.match(result.summary, /Not recorded in Zoho People: attendance, leave utilization\./);
});

test('deterministic summary names missing profile fields instead of guessing them', () => {
  const summary = SummaryGenerator.deterministicSummary(buildCanonical({ Designation: null, Department: null, Dateofjoining: null }));
  assert.match(summary, /^\*\*Priya Nair\*\* is recorded in Zoho People\./);
  assert.match(summary, /Not recorded in Zoho People: designation, department, joining date, attendance, leave utilization\./);
});

test('recorded attendance and leave appear in the deterministic summary', () => {
  const summary = SummaryGenerator.deterministicSummary(buildCanonical({}, {
    attendance: { total_days: 20, present_days: 18 },
    leave: [{ Name: 'Casual Leave', PermittedCount: 10, AvailedCount: 4, BalanceCount: 6 }]
  }));
  assert.match(summary, /Verified attendance is \*\*90%\*\* and leave utilization is \*\*40%\*\*\./);
  assert.doesNotMatch(summary, /Not recorded/);
});
