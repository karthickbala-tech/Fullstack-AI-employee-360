import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeAssertion, fail, installFetch, installSdk, ok, removeSdk } from './helpers.mjs';

const identity = await import('../src/services/webTabIdentity.ts');
const { apiRequest, ApiClientError } = await import('../src/api/apiClient.ts');
const provider = await import('../src/services/employee360DataProvider.ts');

const DIRECTORY = {
  employees: [
    { recordId: '1', employeeId: 'OWN01', fullName: 'Owen Manager', jobTitle: null, department: null, email: null, workLocation: null, status: 'Active' },
    { recordId: '2', employeeId: 'HRM4', fullName: 'Priya Nair', jobTitle: null, department: null, email: null, workLocation: null, status: 'Active' },
    { recordId: '3', employeeId: 'HRM2', fullName: 'Sarah Lee', jobTitle: null, department: null, email: null, workLocation: null, status: 'Active' },
  ],
  total: 3,
  connected: true,
  connectionName: 'zohopeople_employee360_v2',
  source: 'live_zoho_people',
};
const STATUS = { connected: true, connectionName: 'zohopeople_employee360_v2', dataCenter: 'in', portalId: '60076299713', organizationName: 'VSK', message: 'ok' };
const DEV_ME = { authenticationEnabled: false, role: 'development', scope: 'all', employeeId: null, allowedEmployeeIds: null };

function me(overrides) {
  return {
    authenticationEnabled: true,
    authenticated: true,
    role: 'employee',
    scope: 'self',
    employeeId: 'HRM4',
    allowedEmployeeIds: ['HRM4'],
    identitySource: 'zoho_people',
    displayName: 'Priya Nair',
    allowedEmployees: [{ employeeId: 'HRM4', fullName: 'Priya Nair' }],
    canAnalyzeTeam: false,
    canAnalyzeOrganization: false,
    employeeMapping: 'matched',
    ...overrides,
  };
}

function setup(t, routes, { assertion = null } = {}) {
  identity.resetWebTabIdentityForTests();
  if (assertion) installSdk({ invoke: async () => ({ assertion }) });
  else removeSdk();
  const calls = installFetch({
    '/v1/zoho/employees': () => ok(DIRECTORY),
    '/v1/zoho/status': () => ok(STATUS),
    ...routes,
  });
  t.after(() => {
    removeSdk();
    identity.resetWebTabIdentityForTests();
  });
  return calls;
}

const directoryCalls = (calls) => calls.filter((c) => c.url.endsWith('/v1/zoho/employees')).length;

// Headers a "simple" CORS request may carry (no preflight), for text/plain bodies.
const SIMPLE_HEADERS = new Set(['accept', 'content-type']);

test('the assertion travels in a text/plain POST body: no custom header, not in the URL', async (t) => {
  const assertion = fakeAssertion();
  const calls = setup(t, { '/v1/me': () => ok(me()) }, { assertion });
  await apiRequest('https://backend.example/v1/me', { method: 'GET' });
  const [request] = calls;
  assert.equal(request.method, 'POST');
  assert.equal(request.body.e360Assertion, assertion);
  assert.equal(request.url.includes(assertion), false);
  assert.equal(request.url.includes('e360Assertion'), false);
  for (const name of Object.keys(request.headers)) {
    assert.ok(SIMPLE_HEADERS.has(name.toLowerCase()), `unexpected header ${name} would trigger a preflight`);
  }
  assert.match(request.headers['Content-Type'], /^text\/plain/);
});

test('Ask keeps its question and history and adds the assertion to the same body', async (t) => {
  const assertion = fakeAssertion();
  const calls = setup(t, { '/ask': () => ok({ answer: 'ok' }) }, { assertion });
  await apiRequest('https://backend.example/v1/employees/HRM4/ask', {
    method: 'POST',
    body: JSON.stringify({ question: 'What is my department?', history: [] }),
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
  });
  assert.deepEqual(calls[0].body, { question: 'What is my department?', history: [], e360Assertion: assertion });
  assert.equal(calls[0].method, 'POST');
});

test('without an assertion the request is unchanged (plain GET, no identity anywhere)', async (t) => {
  const calls = setup(t, { '/v1/me': () => ok(DEV_ME) });
  await apiRequest('https://backend.example/v1/me', { method: 'GET' });
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].body, null);
  assert.equal(calls[0].headers['x-e360-assertion'], undefined);
});

test('a rejected assertion is replaced once with a new one', async (t) => {
  identity.resetWebTabIdentityForTests();
  let issued = 0;
  installSdk({ invoke: async () => ({ assertion: fakeAssertion({ nonce: `TestNonce_${String(++issued).padStart(10, '0')}` }) }) });
  const seen = [];
  installFetch({
    '/v1/me': ({ body }) => {
      seen.push(body.e360Assertion);
      return seen.length === 1 ? fail(401, 'INVALID_IDENTITY_ASSERTION') : ok(me());
    },
  });
  t.after(() => { removeSdk(); identity.resetWebTabIdentityForTests(); });

  const res = await apiRequest('https://backend.example/v1/me');
  assert.equal(res.data.employeeId, 'HRM4');
  assert.equal(seen.length, 2);
  assert.notEqual(seen[0], seen[1]);
});

test('a network failure is reported as network_error, never as success', async (t) => {
  setup(t, { '/v1/me': () => { throw new TypeError('Failed to fetch'); } }, { assertion: fakeAssertion() });
  await assert.rejects(apiRequest('https://backend.example/v1/me'), (err) =>
    err instanceof ApiClientError && err.kind === 'network_error');
});

test('Development (authentication off): directory shown with an explicit not-verified notice', async (t) => {
  const calls = setup(t, { '/v1/me': () => ok(DEV_ME) });
  const result = await provider.fetchLiveAccess();
  assert.equal(result.state, 'development');
  assert.equal(result.employees.length, 3);
  assert.equal(result.defaultEmployeeId, null);
  assert.match(result.notice, /Development mode/);
  assert.match(result.notice, /not verified/);
  assert.equal(calls[0].url.endsWith('/v1/me'), true, '/v1/me is requested first');
});

test('self-only access lists only the signed-in employee and never reads the directory', async (t) => {
  const calls = setup(t, { '/v1/me': () => ok(me()) }, { assertion: fakeAssertion() });
  const result = await provider.fetchLiveAccess();
  assert.equal(result.state, 'authorized');
  assert.deepEqual(result.employees.map((e) => e.employeeId), ['HRM4']);
  assert.equal(result.defaultEmployeeId, 'HRM4');
  assert.equal(directoryCalls(calls), 0);
});

test('a manager sees only themselves and verified direct reports, opening on their own record', async (t) => {
  const calls = setup(t, {
    '/v1/me': () => ok(me({
      role: 'manager', scope: 'team', employeeId: 'OWN01', displayName: 'Owen Manager',
      allowedEmployeeIds: ['OWN01', 'HRM4'],
      allowedEmployees: [{ employeeId: 'OWN01', fullName: 'Owen Manager' }, { employeeId: 'HRM4', fullName: 'Priya Nair' }],
      canAnalyzeTeam: true,
    })),
  }, { assertion: fakeAssertion() });
  const result = await provider.fetchLiveAccess();
  assert.deepEqual(result.employees.map((e) => e.employeeId), ['OWN01', 'HRM4']);
  assert.equal(result.defaultEmployeeId, 'OWN01');
  assert.equal(directoryCalls(calls), 0);
});

test('the full directory is used only when the backend grants organization scope', async (t) => {
  const calls = setup(t, {
    '/v1/me': () => ok(me({ role: 'admin', scope: 'all', employeeId: 'HRM2', allowedEmployeeIds: null, allowedEmployees: null, canAnalyzeOrganization: true })),
  }, { assertion: fakeAssertion() });
  const result = await provider.fetchLiveAccess();
  assert.equal(result.employees.length, 3);
  assert.equal(result.defaultEmployeeId, 'HRM2');
  assert.equal(directoryCalls(calls), 1);
});

test('an unmatched sign-in gets no employees and a clear reason', async (t) => {
  for (const [mapping, pattern] of [['not_found', /No Zoho People employee record matches/], ['ambiguous', /more than one employee record/]]) {
    const calls = setup(t, {
      '/v1/me': () => ok(me({ employeeId: null, allowedEmployeeIds: [], allowedEmployees: [], employeeMapping: mapping })),
    }, { assertion: fakeAssertion() });
    const result = await provider.fetchLiveAccess();
    assert.equal(result.state, 'no_employee_mapping');
    assert.deepEqual(result.employees, []);
    assert.match(result.notice, pattern);
    assert.equal(directoryCalls(calls), 0);
  }
});

test('a failed /v1/me is reported as it is, with no directory or mock fallback', async (t) => {
  const cases = [
    [() => fail(401, 'INVALID_IDENTITY_ASSERTION'), 'invalid_assertion'],
    [() => fail(401, 'UNAUTHORIZED', 'Authentication required'), 'unauthenticated'],
    [() => fail(403, 'FORBIDDEN'), 'forbidden'],
    [() => { throw new TypeError('Failed to fetch'); }, 'network_error'],
    [() => fail(500, 'INTERNAL_ERROR'), 'backend_error'],
  ];
  for (const [handler, state] of cases) {
    const calls = setup(t, { '/v1/me': handler });
    let caught = null;
    try {
      await provider.fetchLiveAccess();
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, `${state}: fetchLiveAccess must throw`);
    assert.equal(provider.describeAccessFailure(caught).state, state);
    assert.equal(directoryCalls(calls), 0, `${state}: no directory fallback`);
  }
});

test('Demo mode keeps working from the frontend demo dataset without any backend call', async (t) => {
  const calls = setup(t, {});
  const { directory } = await provider.fetchDirectoryAndStatus('mock');
  assert.ok(directory.employees.some((e) => e.employeeId === 'DEMO001'));
  const bundle = await provider.fetchEmployee360Bundle('DEMO001', 'mock');
  assert.ok(bundle.canonical);
  assert.equal(calls.length, 0);
});
