'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fn, silenceLogs } = require('./helpers');

const InsightGenerator = fn('ai/insightGenerator');
const Employee360Builder = fn('intelligence/employee360Builder');

function buildCanonical(extra = {}) {
  return Employee360Builder.build('HRM4', {
    available: true,
    recordId: '371370000000000004',
    raw: { EmployeeID: 'HRM4', FirstName: 'Priya', Department: 'Information Technology', Dateofjoining: '11-Sep-2020' },
    lifecycle: {},
    ...extra
  });
}

function generatorReturning(t, reply) {
  silenceLogs(t);
  return new InsightGenerator({
    model: 'stub-model',
    generateCompletion: async () => (typeof reply === 'string' ? reply : JSON.stringify(reply))
  });
}

test('a late-days trend cites attendance.lateDays, which now exists as evidence', async t => {
  const canonical = buildCanonical({ attendance: { total_days: 20, present_days: 18, late_days: 5 } });
  assert.ok(canonical.evidence.some(e => e.domain === 'attendance' && e.field === 'lateDays'));

  const insights = await generatorReturning(t, []).generateInsights(canonical);
  const trend = insights.find(i => i.type === 'Trend');
  assert.deepEqual(trend.evidence, ['attendance.lateDays']);
  assert.match(trend.description, /5 late check-in/);
});

test('every deterministic insight cites only domain.field references present in evidence', async t => {
  const canonical = buildCanonical({ attendance: { total_days: 20, present_days: 18, late_days: 5 } });
  const insights = await generatorReturning(t, []).generateInsights(canonical);
  const available = new Set(canonical.evidence.map(e => `${e.domain}.${e.field}`));
  assert.ok(insights.length >= 2);
  for (const insight of insights) {
    assert.ok(insight.evidence.length > 0);
    for (const ref of insight.evidence) assert.ok(available.has(ref), ref);
  }
});

test('a trend without supporting evidence is skipped rather than given text as evidence', async t => {
  const canonical = buildCanonical();
  canonical.trends = [{ domain: 'attendance', metric: 'punctuality', evidence: '9 late check-ins', evidenceRefs: ['attendance.lateDays'] }];
  const insights = await generatorReturning(t, []).generateInsights(canonical);
  assert.ok(!insights.some(i => i.type === 'Trend'));
});

test('AI insights without evidence are rejected as a batch', async t => {
  const insights = await generatorReturning(t, [
    { domain: 'employment', headline: 'Long-serving', description: 'Six years of service.', evidence: ['employment.tenure'] },
    { domain: 'general', headline: 'High potential', description: 'Likely to be promoted.', evidence: [] }
  ]).generateInsights(buildCanonical());
  assert.ok(!insights.some(i => i.type === 'AI Insight'));
});

test('grounded AI insights are accepted, even when wrapped in a code fence', async t => {
  const insights = await generatorReturning(t, '```json\n[{"domain":"employment","headline":"Long-serving","description":"Six years of service.","evidence":["employment.tenure"]}]\n```')
    .generateInsights(buildCanonical());
  const ai = insights.filter(i => i.type === 'AI Insight');
  assert.equal(ai.length, 1);
  assert.deepEqual(ai[0].evidence, ['employment.tenure']);
});
