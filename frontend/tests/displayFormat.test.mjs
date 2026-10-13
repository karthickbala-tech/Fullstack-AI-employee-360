import test from 'node:test';
import assert from 'node:assert/strict';

const d = await import('../src/services/displayFormat.ts');

// A live-style record with the gaps seen in the Web Tab: tenure known, no attendance,
// no leave, no appraisal, no learning.
const LIVE_GAPS = {
  employment: { dateOfJoining: '19-Jul-2024' },
  deterministicMetrics: {
    tenure: { formatted: '2 yrs 2 mos', classification: 'Calculation' },
    attendancePercentage: { value: null, formatted: 'Unknown', classification: 'Unknown' },
    leaveUtilization: { value: null, formatted: 'Unknown', classification: 'Unknown' },
  },
  attendance: { presentDays: null, totalWorkingDays: null },
  leave: { takenThisYear: null },
  performance: { currentReviewPeriod: null },
  learning: { completedCourses: [], certifications: [], enrolledCourses: [] },
  evidence: new Array(6).fill({ domain: 'employee', field: 'x' }),
};

test('dates show as day month year', () => {
  assert.equal(d.formatDisplayDate('2023-06-15'), '15 Jun 2023');
  assert.equal(d.formatDisplayDate('19-Jul-2024'), '19 Jul 2024');
  assert.equal(d.formatDisplayDate('19-JUL-2024'), '19 Jul 2024');
  assert.equal(d.formatDisplayDate(''), null);
  assert.equal(d.formatDisplayDate(null), null);
});

test('missing values read as clear sentences, never "null" or a bare "Unknown"', () => {
  const views = [d.tenureKpi, d.attendanceKpi, d.leaveKpi, d.appraisalKpi, d.learningKpi, d.evidenceKpi].map((fn) => fn(LIVE_GAPS));
  for (const view of views) {
    assert.doesNotMatch(`${view.value} ${view.sub}`, /\bnull\b|\bundefined\b|NaN/);
    assert.notEqual(view.value, 'Unknown');
  }
  assert.deepEqual(d.tenureKpi(LIVE_GAPS), { value: '2 yrs 2 mos', sub: 'Joined 19 Jul 2024', classification: 'Calculation', missing: false });
  assert.deepEqual(d.attendanceKpi(LIVE_GAPS), { value: 'No data', sub: 'No attendance records for this period', classification: 'Unknown', missing: true });
  assert.deepEqual(d.leaveKpi(LIVE_GAPS), { value: 'No data', sub: 'No leave records for this year', classification: 'Unknown', missing: true });
  assert.deepEqual(d.appraisalKpi(LIVE_GAPS), { value: 'Not available', sub: 'No appraisal rating recorded in Zoho People', classification: 'Unknown', missing: true });
  assert.equal(d.learningKpi(LIVE_GAPS).value, 'Not available');
  assert.equal(d.learningKpi(LIVE_GAPS).classification, 'Unknown', 'no learning source is not a Fact');
  assert.deepEqual(d.evidenceKpi(LIVE_GAPS), { value: '6 records', sub: 'Verified source fields', classification: 'Fact', missing: false });
});

test('present values keep their real numbers and classification', () => {
  const full = {
    ...LIVE_GAPS,
    deterministicMetrics: {
      ...LIVE_GAPS.deterministicMetrics,
      attendancePercentage: { value: 96, formatted: '96%', classification: 'Calculation' },
      leaveUtilization: { value: 33, formatted: '33%', classification: 'Calculation' },
      performanceRating: { value: 4.6, classification: 'Fact' },
    },
    attendance: { presentDays: 127, totalWorkingDays: 132 },
    leave: { takenThisYear: 1 },
    performance: { currentReviewPeriod: 'FY 2025-2026' },
    learning: { completedCourses: ['a', 'b'], certifications: ['c'], enrolledCourses: ['d'] },
  };
  assert.equal(d.attendanceKpi(full).sub, '127 of 132 working days present');
  assert.equal(d.leaveKpi(full).sub, '1 day taken this year');
  assert.equal(d.appraisalKpi(full).value, '4.6 / 5.0');
  assert.deepEqual(d.learningKpi(full), { value: '3 completed', sub: '1 in progress', classification: 'Fact', missing: false });
  assert.equal(d.evidenceKpi({ evidence: [] }).missing, true);
  assert.equal(d.tenureKpi({ deterministicMetrics: { tenure: { formatted: 'Unknown' } }, employment: {} }).value, 'Not recorded');
});

test('summaries without bold get key facts bolded; bolded summaries are left alone', () => {
  const text =
    'Sarah Anderson (DEMO001) is a Senior HR Executive in Human Resources, based at Bengaluru HQ. ' +
    'She joined on 2023-06-15, has a tenure of 3 years and 3 months, a 96% attendance rate and a 4.6 / 5.0 rating.';
  const out = d.emphasizeKeyFacts(text, ['Sarah Anderson', 'Senior HR Executive', 'Human Resources', 'Bengaluru HQ', null]);
  for (const fact of ['Sarah Anderson', 'Senior HR Executive', 'Human Resources', 'Bengaluru HQ', '2023-06-15', '3 years and 3 months', '96%', '4.6 / 5.0']) {
    assert.ok(out.includes(`**${fact}**`), fact);
  }
  assert.equal(out.replace(/\*\*/g, ''), text, 'only emphasis is added; the words are unchanged');
  const already = 'Priya has **96%** attendance.';
  assert.equal(d.emphasizeKeyFacts(already, ['Priya']), already);
});
