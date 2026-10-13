'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fn, silenceLogs, jsonResponse } = require('./helpers');

const ZohoPeopleClient = fn('connectors/zohoPeople/zohoPeopleClient');
const { NotFoundError, ExternalServiceError, RateLimitError } = fn('utils/errors');

function makeClient(t, responses) {
  silenceLogs(t);
  const client = new ZohoPeopleClient();
  client._resolveConnectionCredentials = async () => ({ headers: { Authorization: 'Zoho-oauthtoken test' } });
  client._sleep = async () => {};
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  t.after(() => { global.fetch = originalFetch; });
  return { client, calls };
}

test('parseJson keeps Zoho IDs beyond MAX_SAFE_INTEGER exact', () => {
  const parsed = ZohoPeopleClient.parseJson(
    '{"recordId":371370000000337401,"other":371370000000337409,"count":12,"ratio":1.5,"neg":-5}'
  );
  assert.equal(parsed.recordId, '371370000000337401');
  assert.equal(parsed.other, '371370000000337409');
  assert.equal(parsed.count, 12);
  assert.equal(parsed.ratio, 1.5);
  assert.equal(parsed.neg, -5);
});

test('Zoho in-body "no records" error maps to 404, never HTTP 200', async t => {
  const { client } = makeClient(t, [
    jsonResponse({ response: { status: 1, errors: { code: 7024, message: 'No records found' } } })
  ]);
  await assert.rejects(client.request('/people/api/forms/employee/getRecords'), err =>
    err instanceof NotFoundError && err.statusCode === 404 && err.zohoCode === 7024);
});

test('Zoho invalid authtoken maps to 502 with a generic message', async t => {
  const { client } = makeClient(t, [
    jsonResponse({ response: { errors: { code: 7202, message: 'Invalid OAuthtoken secret-detail' } } })
  ]);
  await assert.rejects(client.request('/x'), err =>
    err instanceof ExternalServiceError &&
    err.statusCode === 502 &&
    err.isAuthError === true &&
    !err.message.includes('secret-detail'));
});

test('Zoho permission codes map to 502 permission errors', async t => {
  const { client } = makeClient(t, [
    jsonResponse({ response: { errors: [{ code: 7040, message: 'No permission' }] } })
  ]);
  await assert.rejects(client.request('/x'), err => err.statusCode === 502 && err.isPermissionError === true);
});

test('Zoho rate-limit message maps to 429 and is retried', async t => {
  const limited = () => jsonResponse({ response: { errors: { code: 7300, message: 'Maximum limit exceeded' } } });
  const { client, calls } = makeClient(t, [limited(), limited(), limited()]);
  await assert.rejects(client.request('/x'), err => err instanceof RateLimitError && err.statusCode === 429);
  assert.equal(calls.length, 3);
});

test('HTTP 429 carries Retry-After seconds', async t => {
  const r = () => jsonResponse('busy', 429, { 'retry-after': '7' });
  const { client } = makeClient(t, [r(), r(), r()]);
  await assert.rejects(client.request('/x'), err => err instanceof RateLimitError && err.retryAfterSeconds === 7);
});

test('HTTP 5xx is a 502 without upstream body text', async t => {
  const r = () => jsonResponse('<html>internal stack trace</html>', 503);
  const { client } = makeClient(t, [r(), r(), r()]);
  await assert.rejects(client.request('/x'), err =>
    err.statusCode === 502 && err.message === 'Zoho People returned HTTP 503');
});

test('network failure is retried, then succeeds', async t => {
  const { client, calls } = makeClient(t, [
    new TypeError('fetch failed'),
    jsonResponse({ response: { result: [] } })
  ]);
  const data = await client.request('/x');
  assert.deepEqual(data, { response: { result: [] } });
  assert.equal(calls.length, 2);
});

test('timeout is reported as a 502 timeout', async t => {
  const timeout = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
  const { client } = makeClient(t, [timeout(), timeout(), timeout()]);
  await assert.rejects(client.request('/x'), err =>
    err.statusCode === 502 && err.message === 'Zoho People request timed out');
});

test('every request carries an abort signal and query params', async t => {
  const { client, calls } = makeClient(t, [jsonResponse({ response: { result: [] } })]);
  await client.request('https://people.zoho.in/people/api/forms/employee/getRecords', { params: { sIndex: 1, limit: 200 } });
  assert.ok(calls[0].init.signal);
  assert.match(calls[0].url, /\?sIndex=1&limit=200$/);
});
