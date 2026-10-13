'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fn, silenceLogs } = require('./helpers');

const Employee360Repository = fn('repositories/employee360Repository');
const HttpUtils = fn('utils/http');
const { RateLimitError, NotFoundError } = fn('utils/errors');

test('snapshot domains are stored whole as valid JSON', () => {
  const { value, omitted } = Employee360Repository.serializeDomain({ jobTitle: 'Manager' });
  assert.equal(omitted, null);
  assert.deepEqual(JSON.parse(value), { jobTitle: 'Manager' });
});

test('an oversize domain becomes a valid marker, never truncated JSON', () => {
  const big = { items: 'x'.repeat(20000) };
  const { value, omitted } = Employee360Repository.serializeDomain(big);
  const parsed = JSON.parse(value);
  assert.equal(parsed._omitted, true);
  assert.equal(parsed.reason, 'exceeds_column_limit');
  assert.equal(parsed.length, JSON.stringify(big).length);
  assert.ok(omitted.length > 9999);
});

test('unchanged snapshot is not rewritten', async t => {
  silenceLogs(t);
  const repo = new Employee360Repository();
  const canonical = { employee: { fullName: 'Sarah Sanders' }, timeline: [], evidence: [] };
  const existing = { ROWID: '67649000000041100' };
  for (const [domain, column] of Object.entries(repo.columnMap)) {
    const fallback = ['skills', 'timeline', 'evidence'].includes(domain) ? [] : {};
    existing[column] = JSON.stringify(canonical[domain] ?? fallback);
  }
  const writes = [];
  repo._getCatalystApp = () => ({
    datastore: () => ({ table: () => ({
      updateRow: async () => { writes.push('update'); },
      insertRow: async () => { writes.push('insert'); }
    }) })
  });
  repo._findLatestSnapshot = async () => existing;
  await repo.saveSnapshot('HRM2', canonical, { tenantId: 'vsk_hr_solution' });
  assert.deepEqual(writes, []);
});

function snapshotWrites(t, storedCanonical, newCanonical) {
  silenceLogs(t);
  const repo = new Employee360Repository();
  const existing = { ROWID: '67649000000041100' };
  for (const [domain, column] of Object.entries(repo.columnMap)) {
    const fallback = ['skills', 'timeline', 'evidence'].includes(domain) ? [] : {};
    existing[column] = JSON.stringify(storedCanonical[domain] ?? fallback);
  }
  const writes = [];
  repo._getCatalystApp = () => ({
    datastore: () => ({ table: () => ({
      updateRow: async () => { writes.push('update'); },
      insertRow: async () => { writes.push('insert'); }
    }) })
  });
  repo._findLatestSnapshot = async () => existing;
  return repo.saveSnapshot('HRM2', newCanonical, { tenantId: 'vsk_hr_solution' }).then(() => writes);
}

const evidenceAt = (sourceTimestamp, value = 'sarah@example.com') => ({
  employee: { fullName: 'Sarah Sanders' },
  evidence: [{ domain: 'employee', field: 'email', value, sourceTimestamp }]
});

test('a rebuild that differs only in evidence build time is not rewritten', async t => {
  const writes = await snapshotWrites(t,
    evidenceAt('2026-10-07T10:00:00.000Z'),
    evidenceAt('2026-10-07T10:00:00.480Z'));
  assert.deepEqual(writes, []);
});

test('a real evidence change still updates the snapshot', async t => {
  const writes = await snapshotWrites(t,
    evidenceAt('2026-10-07T10:00:00.000Z'),
    evidenceAt('2026-10-07T10:00:00.480Z', 'sarah.new@example.com'));
  assert.deepEqual(writes, ['update']);
});

function captureResponse() {
  const res = { status: null, headers: null, body: null };
  res.writeHead = (status, headers) => { res.status = status; res.headers = headers; };
  res.end = body => { res.body = JSON.parse(body); };
  return res;
}

test('unexpected errors are reported generically as 500', t => {
  silenceLogs(t);
  const res = captureResponse();
  HttpUtils.sendError(res, new TypeError("Cannot read properties of undefined (reading 'x') at /srv/app.js"));
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { success: false, error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } });
});

test('429 responses carry Retry-After', t => {
  silenceLogs(t);
  const res = captureResponse();
  HttpUtils.sendError(res, new RateLimitError(undefined, 7));
  assert.equal(res.status, 429);
  assert.equal(res.headers['Retry-After'], '7');
  assert.equal(res.body.error.code, 'RATE_LIMITED');
});

test('application errors keep their status, code and message', t => {
  silenceLogs(t);
  const res = captureResponse();
  HttpUtils.sendError(res, new NotFoundError("Employee 'NOPE1' was not found in Zoho People"));
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
});
