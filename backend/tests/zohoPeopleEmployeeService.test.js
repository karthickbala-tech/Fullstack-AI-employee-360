'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fn, silenceLogs } = require('./helpers');

const ZohoPeopleEmployeeService = fn('connectors/zohoPeople/zohoPeopleEmployeeService');
const { NotFoundError, ConflictError, ExternalServiceError } = fn('utils/errors');

function page(records) {
  return {
    response: {
      result: records.map(r => ({ [r.id]: [{ Zoho_ID: r.id, ...r.fields }] }))
    }
  };
}

function makeService(t, handler) {
  silenceLogs(t);
  const calls = [];
  const client = {
    tenantConfig: { dataCenter: 'in' },
    request: async (url, options = {}) => {
      calls.push({ url, params: options.params || null });
      return handler(url, options.params || {});
    }
  };
  return { service: new ZohoPeopleEmployeeService(client), calls };
}

const EMPLOYEES = Array.from({ length: 7 }, (_, i) => ({
  id: `37137000000043600${i}`,
  fields: { EmployeeID: `E${i}`, FirstName: `F${i}`, LastName: `L${i}`, EmailID: `e${i}@x.com`, Employeestatus: 'Active' }
}));

test('unwrapRecords uses the record-ID key and keeps it as a string', () => {
  const records = ZohoPeopleEmployeeService.unwrapRecords({
    response: { result: [{ '371370000000436031': [{ EmployeeID: 'HRM9' }] }] }
  });
  assert.deepEqual(records, [{ recordId: '371370000000436031', fields: { EmployeeID: 'HRM9' } }]);
});

test('directory pages with sIndex/limit until a short page', async t => {
  const { service, calls } = makeService(t, (url, params) => {
    const start = params.sIndex - 1;
    return page(EMPLOYEES.slice(start, start + params.limit));
  });
  const directory = await service.getLiveEmployeeDirectory(null, { pageSize: 3 });
  assert.equal(directory.length, 7);
  assert.deepEqual(calls.map(c => c.params.sIndex), [1, 4, 7]);
  assert.ok(calls.every(c => c.params.limit === 3));
});

test('directory stops on Zoho "no records" (7024) at an exact page boundary', async t => {
  const six = EMPLOYEES.slice(0, 6);
  const { service } = makeService(t, (url, params) => {
    const slice = six.slice(params.sIndex - 1, params.sIndex - 1 + params.limit);
    if (slice.length === 0) throw Object.assign(new NotFoundError(), { zohoCode: 7024 });
    return page(slice);
  });
  const directory = await service.getLiveEmployeeDirectory(null, { pageSize: 3 });
  assert.equal(directory.length, 6);
});

test('a repeated page (ignored paging parameter) fails loudly instead of looping', async t => {
  const { service } = makeService(t, () => page(EMPLOYEES.slice(0, 3)));
  await assert.rejects(service.getLiveEmployeeDirectory(null, { pageSize: 3 }), ExternalServiceError);
});

test('directory drops records without a stable EmployeeID and maps verified fields', async t => {
  const { service } = makeService(t, () => page([
    { id: '371370000000000001', fields: { EmployeeID: 'HRM1', FirstName: 'David', LastName: null, LocationName: 'Chennai HQ', Work_location: 'Desk 4', Employeestatus: 'Active' } },
    { id: '371370000000000002', fields: { EmployeeID: '', FirstName: 'NoId' } },
    { id: '371370000000000003', fields: { FirstName: 'Missing' } }
  ]));
  const directory = await service.getLiveEmployeeDirectory();
  assert.equal(directory.length, 1);
  assert.deepEqual(directory[0], {
    recordId: '371370000000000001',
    employeeId: 'HRM1',
    fullName: 'David',
    jobTitle: null,
    department: null,
    email: null,
    workLocation: 'Chennai HQ',
    status: 'Active',
    reportingManagerId: null
  });
});

test('directory resolves reportingManagerId only to an EmployeeID present in the same directory', async t => {
  const { service } = makeService(t, () => page([
    { id: '371370000000000010', fields: { EmployeeID: 'OWN01', Reporting_To: '' } },
    { id: '371370000000000011', fields: { EmployeeID: 'HRM1' } },
    { id: '371370000000000012', fields: { EmployeeID: 'HRM2', Reporting_To: 'David Rickman HRM1' } },
    { id: '371370000000000013', fields: { EmployeeID: 'HRM3', Reporting_To: 'Rahul Kumar  OWN01 ' } },
    { id: '371370000000000014', fields: { EmployeeID: 'HRM4', Reporting_To: 'karthickbala OWN01' } },
    { id: '371370000000000015', fields: { EmployeeID: 'X1', Reporting_To: 'David Rickman' } },
    { id: '371370000000000016', fields: { EmployeeID: 'X2', Reporting_To: 'Unknown' } },
    { id: '371370000000000017', fields: { EmployeeID: 'X3', Reporting_To: 'Someone Else ZZ99' } },
    { id: '371370000000000018', fields: { EmployeeID: 'X4', Reporting_To: 'Lower Case hrm1' } },
    { id: '371370000000000019', fields: { EmployeeID: 'X5', Reporting_To: { ID: 'HRM1' } } }
  ]));
  const directory = await service.getLiveEmployeeDirectory();
  const managers = Object.fromEntries(directory.map(e => [e.employeeId, e.reportingManagerId]));
  assert.deepEqual(managers, {
    OWN01: null,
    HRM1: null,
    HRM2: 'HRM1',
    HRM3: 'OWN01',
    HRM4: 'OWN01',
    X1: null,
    X2: null,
    X3: null,
    X4: null,
    X5: null
  });
});

test('reportingManagerId is null when the manager EmployeeID is duplicated in the directory', async t => {
  const { service } = makeService(t, () => page([
    { id: '371370000000000020', fields: { EmployeeID: 'DUP1' } },
    { id: '371370000000000021', fields: { EmployeeID: 'DUP1' } },
    { id: '371370000000000022', fields: { EmployeeID: 'E1', Reporting_To: 'Twin Manager DUP1' } }
  ]));
  const directory = await service.getLiveEmployeeDirectory();
  assert.equal(directory.find(e => e.employeeId === 'E1').reportingManagerId, null);
});

test('employee lookup selects the exact EmployeeID, never the first search hit', async t => {
  const { service } = makeService(t, () => page([
    { id: '1', fields: { EmployeeID: 'HRM20' } },
    { id: '2', fields: { EmployeeID: 'HRM2' } }
  ]));
  const raw = await service.getEmployeeRawData('HRM2');
  assert.equal(raw.available, true);
  assert.equal(raw.recordId, '2');
  assert.equal(raw.raw.EmployeeID, 'HRM2');
});

test('duplicate EmployeeID is a 409 conflict', async t => {
  const { service } = makeService(t, () => page([
    { id: '1', fields: { EmployeeID: 'DUP1' } },
    { id: '2', fields: { EmployeeID: 'DUP1' } }
  ]));
  await assert.rejects(service.getEmployeeRawData('DUP1'), err => err instanceof ConflictError && err.statusCode === 409);
});

test('lookup does not match by name or email', async t => {
  const { service } = makeService(t, () => page([
    { id: '1', fields: { EmployeeID: 'HRM3', FirstName: 'Rahul', EmailID: 'rahul@x.com' } }
  ]));
  const byName = await service.getEmployeeRawData('Rahul');
  assert.equal(byName.available, false);
  assert.equal(byName.error, 'NOT_FOUND');
});

test('upstream failure during lookup propagates instead of becoming NOT_FOUND', async t => {
  const { service } = makeService(t, () => {
    const err = new ExternalServiceError('Zoho People request timed out');
    throw err;
  });
  await assert.rejects(service.getEmployeeRawData('HRM2'), ExternalServiceError);
});

test('search "no records" falls back to an exact directory scan', async t => {
  const { service, calls } = makeService(t, (url, params) => {
    if (params.searchColumn) throw Object.assign(new NotFoundError(), { zohoCode: 7024 });
    if (url.includes('getRecords')) return page([{ id: '9', fields: { EmployeeID: 'HRM9' } }]);
    throw new NotFoundError();
  });
  const raw = await service.getEmployeeRawData('HRM9');
  assert.equal(raw.available, true);
  assert.equal(raw.recordId, '9');
  assert.ok(calls.some(c => c.params && c.params.sIndex === 1));
});

test('findEmployeesByEmail matches case-insensitively and exactly', async t => {
  const { service } = makeService(t, () => page([
    { id: '1', fields: { EmployeeID: 'A', EmailID: 'Priya@Example.com' } },
    { id: '2', fields: { EmployeeID: 'B', EmailID: 'priya@example.com.au' } }
  ]));
  const matches = await service.findEmployeesByEmail('priya@example.com');
  assert.deepEqual(matches.map(m => m.employeeId), ['A']);
});
