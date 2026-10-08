'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fn, silenceLogs } = require('./helpers');

const Employee360Service = fn('services/employee360Service');
const ZohoPeopleEmployeeService = fn('connectors/zohoPeople/zohoPeopleEmployeeService');
const AskService = fn('services/askService');

const RAW = {
  source: 'zoho_people',
  employeeId: 'HRM4',
  available: true,
  recordId: '371370000000000004',
  raw: { EmployeeID: 'HRM4', FirstName: 'Priya', Department: 'Information Technology', EmailID: 'p@example.com' },
  attendance: null,
  leave: null,
  lifecycle: {}
};

function makeService(t) {
  silenceLogs(t);
  const service = new Employee360Service();
  const writes = { snapshot: 0, evidence: 0 };
  service.zohoService = { getEmployeeRawData: async () => RAW };
  service.repository = { saveSnapshot: async () => { writes.snapshot += 1; } };
  service.evidenceRepository = { storeBatch: async () => { writes.evidence += 1; } };
  return { service, writes };
}

test('GET /360 (default) still persists the snapshot and evidence', async t => {
  const { service, writes } = makeService(t);
  await service.getCanonical360('HRM4', { requestId: 'r1' });
  assert.deepEqual(writes, { snapshot: 1, evidence: 1 });
});

test('read paths with persist:false build the same data without Data Store writes', async t => {
  const { service, writes } = makeService(t);
  const persisted = await service.getCanonical360('HRM4', { requestId: 'r1' });
  const readOnly = await service.getCanonical360('HRM4', { requestId: 'r2' }, { persist: false });
  assert.deepEqual(writes, { snapshot: 1, evidence: 1 });
  assert.equal(readOnly.organisation.department, persisted.organisation.department);
  assert.deepEqual(readOnly.evidence.map(e => e.field), persisted.evidence.map(e => e.field));
});

test('Ask builds Employee 360 without persisting it', async t => {
  silenceLogs(t);
  const ask = new AskService();
  let options = null;
  ask.employee360Service = {
    getCanonical360: async (id, ctx, opts) => {
      options = opts;
      return { isLiveZohoData: true, metadata: { employeeId: id }, employee: {}, employment: {}, organisation: { department: 'IT' }, deterministicMetrics: {}, evidence: [{ domain: 'organisation', field: 'department' }], limitations: [] };
    }
  };
  ask.aiInteractionRepository = { logInteraction: async () => {} };
  await ask.ask('HRM4', 'What is my department?', {});
  assert.deepEqual(options, { persist: false });
});

test('attendance, leave and lifecycle lookups run concurrently', async t => {
  silenceLogs(t);
  let inFlight = 0;
  let maxInFlight = 0;
  const client = {
    tenantConfig: { dataCenter: 'in' },
    request: async url => {
      if (url.includes('recordId=')) {
        return { response: { result: [{ '371370000000000004': [{ Zoho_ID: '371370000000000004', EmployeeID: 'HRM4' }] }] } };
      }
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 20));
      inFlight -= 1;
      return { response: { result: [] } };
    }
  };
  const service = new ZohoPeopleEmployeeService(client);
  const raw = await service.getEmployeeRawData('371370000000000004');
  assert.equal(raw.available, true);
  // attendance + leave + 4 lifecycle form searches overlap instead of running one by one.
  assert.ok(maxInFlight >= 3, `expected concurrent lookups, saw at most ${maxInFlight}`);
  assert.deepEqual(Object.keys(raw.lifecycle).sort(), ['exitinterview', 'zp_deceased', 'zp_resignation', 'zp_termination']);
});
