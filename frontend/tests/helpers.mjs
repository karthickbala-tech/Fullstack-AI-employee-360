// Shared test helpers: a stand-in Zoho People Widget SDK and a routed fetch.

const b64url = (text) => Buffer.from(text).toString('base64url');

/** An assertion-shaped string. Its signature is fake: React never verifies it. */
export function fakeAssertion({ email = 'priya@example.com', iat, exp, nonce = 'TestNonce_0123456789' } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const issued = iat ?? now;
  const payload = ['1', 'e360_webtab', email, '60076299713', issued, exp ?? issued + 240, nonce].join('|');
  return `${b64url(payload)}.${b64url('not-a-real-signature-000000000000')}`;
}

/** Installs window.ZOHO with an init and invokeStandaloneFunction that tests control. */
export function installSdk({ init = async () => ({}), invoke } = {}) {
  const calls = { init: 0, invoke: [] };
  globalThis.ZOHO = {
    embeddedApp: {
      init: () => {
        calls.init += 1;
        return init();
      },
    },
    People: {
      API: {
        invokeStandaloneFunction: (options) => {
          calls.invoke.push(options);
          return invoke(options, calls.invoke.length);
        },
      },
    },
  };
  return calls;
}

export function removeSdk() {
  delete globalThis.ZOHO;
}

function envelope(data) {
  return { success: true, data, meta: {} };
}

function errorEnvelope(code, message) {
  return { success: false, error: { code, message } };
}

/**
 * Replaces fetch with a router: routes maps a path suffix to a handler returning
 * { status, body } or a thrown TypeError (network failure). Records every call.
 */
export function installFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const headers = { ...(init.headers || {}) };
    const body = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : null;
    calls.push({ url, method: init.method || 'GET', headers, body });
    const route = Object.keys(routes).find((suffix) => url.endsWith(suffix));
    if (!route) throw new TypeError('Failed to fetch');
    const result = await routes[route]({ url, headers, body, calls });
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      statusText: '',
      json: async () => result.body,
    };
  };
  return calls;
}

export const ok = (data) => ({ status: 200, body: envelope(data) });
export const fail = (status, code, message = code) => ({ status, body: errorEnvelope(code, message) });
