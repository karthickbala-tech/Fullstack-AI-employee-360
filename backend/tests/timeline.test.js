'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fn, silenceLogs } = require('./helpers');

const DateUtils = fn('utils/dates');
const TimelineIntelligenceService = fn('intelligence/timelineService');
const TimelineRepository = fn('repositories/timelineRepository');
const TimelineService = fn('services/timelineService');
const { buildTimelineEventId } = fn('utils/identifiers');

const canonical = {
  metadata: { employeeId: 'HRM2', tenantId: 'vsk_hr_solution', sourceRecordId: '371370000000338068' },
  employment: { dateOfJoining: '15-Mar-2023', jobTitle: 'Manager' },
  career: { promotions: [] }
};

test('toIsoDate accepts only unambiguous formats and never shifts the day', () => {
  assert.equal(DateUtils.toIsoDate('15-Mar-2023'), '2023-03-15');
  assert.equal(DateUtils.toIsoDate('2023-03-15'), '2023-03-15');
  assert.equal(DateUtils.toIsoDate('2023-03-15 00:00:00'), '2023-03-15');
  assert.equal(DateUtils.toIsoDate('05-03-2023'), null);
  assert.equal(DateUtils.toIsoDate('31-Feb-2023'), null);
  assert.equal(DateUtils.toIsoDate(''), null);
  assert.equal(DateUtils.toIsoDate(null), null);
});

test('tenure from a Zoho date is computed in UTC calendar days', () => {
  const tenure = DateUtils.calculateTenure('15-Mar-2023', new Date('2026-10-03T00:00:00Z'));
  assert.equal(tenure.years, 3);
  assert.equal(tenure.months, 6);
  assert.equal(tenure.formatted, '3 yrs 6 mos');
});

test('generated event IDs are deterministic and dates are ISO', () => {
  const first = TimelineIntelligenceService.buildEvents(canonical);
  const second = TimelineIntelligenceService.buildEvents(canonical);
  assert.equal(first.length, 1);
  assert.equal(first[0].id, second[0].id);
  assert.equal(first[0].date, '2023-03-15');
  assert.equal(first[0].eventCode, 'JOINED');
  assert.equal(first[0].id, buildTimelineEventId({
    tenantId: 'vsk_hr_solution',
    employeeId: 'HRM2',
    eventCode: 'JOINED',
    eventDate: '2023-03-15',
    sourceRecordId: '371370000000338068'
  }));
});

test('no event is invented for a missing or ambiguous date', () => {
  const events = TimelineIntelligenceService.buildEvents({
    ...canonical,
    employment: { dateOfJoining: '05-03-2023', confirmationDate: null }
  });
  assert.deepEqual(events, []);
});

test('stored rows map back to the same event; legacy rows are ignored', () => {
  const repo = new TimelineRepository();
  const [generated] = TimelineIntelligenceService.buildEvents(canonical);
  const stored = repo._mapStoredEvent({
    eventId: generated.id,
    eventType: 'JOINED',
    eventDate: '2023-03-15 00:00:00',
    description: 'Joined as Manager',
    source: 'zoho_people',
    sourceRecordId: '371370000000338068'
  });
  assert.equal(stored.id, generated.id);
  assert.equal(stored.date, '2023-03-15');
  assert.equal(stored.title, 'Joined Company');
  assert.equal(repo._mapStoredEvent({ eventId: 'x', eventType: 'LIFECYCLE', eventDate: '2023-03-15 00:00:00' }), null);
});

test('recordEvent persists the generated ID and skips unchanged rows', async t => {
  silenceLogs(t);
  const repo = new TimelineRepository();
  const [event] = TimelineIntelligenceService.buildEvents(canonical);
  const rows = new Map();
  const writes = [];
  repo._getCatalystApp = () => ({
    datastore: () => ({
      table: () => ({
        insertRow: async row => { writes.push('insert'); const r = { ROWID: '1', ...row }; rows.set(row.eventId, r); return r; },
        updateRow: async row => { writes.push('update'); rows.set(row.eventId, row); return row; }
      })
    })
  });
  repo._findByEventId = async id => rows.get(id) || null;

  await repo.recordEvent({ ...event, employeeId: 'HRM2' }, { tenantId: 'vsk_hr_solution' });
  await repo.recordEvent({ ...event, employeeId: 'HRM2' }, { tenantId: 'vsk_hr_solution' });

  assert.deepEqual(writes, ['insert']);
  assert.ok(rows.has(event.id));
  assert.equal(rows.get(event.id).eventDate, '2023-03-15 00:00:00');
  assert.equal(rows.get(event.id).eventType, 'JOINED');
});

test('timeline response never contains duplicates or stale derived rows', async t => {
  silenceLogs(t);
  const service = new TimelineService();
  const [event] = TimelineIntelligenceService.buildEvents(canonical);
  service.employee360Service = { getCanonical360: async () => ({ ...canonical, timeline: [event] }) };
  service.timelineRepository = {
    recordEvent: async () => {},
    getEventsByEmployeeId: async () => [
      { ...event },
      { ...event, id: 'stale-joined-row', date: '2020-01-01' }
    ]
  };
  const first = await service.getEmployeeTimeline('HRM2', {});
  const second = await service.getEmployeeTimeline('HRM2', {});
  assert.equal(first.totalEvents, 1);
  assert.equal(second.totalEvents, 1);
  assert.equal(first.events[0].id, event.id);
});
