/**
 * Zoho People Web Tab identity bridge (frontend side).
 *
 * The Web Tab obtains a short-lived signed identity assertion by invoking a
 * Zoho People standalone function through the Widget SDK, and forwards it to
 * the backend in the request body (`e360Assertion` in a text/plain POST, so
 * the browser sends no CORS preflight; see api/apiClient). The browser never signs,
 * verifies or interprets the assertion and never decides access: the backend
 * verifies it and returns the caller's scope from GET /v1/me.
 *
 * Expected function result: a map whose `assertion` key holds
 * `base64url(payload).base64url(signature)`, possibly wrapped by the SDK
 * response or serialized as a JSON string.
 *
 * Outside Zoho People (local development) or while the function does not
 * exist, no assertion is available and requests are sent without the header.
 */

interface ZohoPeopleWidgetSdk {
  embeddedApp?: { init: () => Promise<unknown> };
  People?: {
    API?: {
      invokeStandaloneFunction: (options: { fnName: string; params: string }) => Promise<unknown>;
    };
  };
}

declare global {
  interface Window {
    ZOHO?: ZohoPeopleWidgetSdk;
  }
}

export type IdentityStatus =
  | 'not_requested'
  | 'available'
  | 'sdk_unavailable'
  | 'function_unavailable';

// Production identity function name in Zoho People. The temporary probe
// function is deliberately not used here.
export const IDENTITY_FUNCTION_NAME = 'e360_identity_assertion';

const SDK_INIT_TIMEOUT_MS = 8000;
// Assertions live at most 5 minutes on the backend; refresh well before that.
const ASSERTION_REUSE_MS = 4 * 60 * 1000;
// Never reuse an assertion within this margin of its declared expiry.
const EXPIRY_MARGIN_MS = 30 * 1000;
// After a failure, wait before invoking the function again.
const FAILURE_RETRY_MS = 60 * 1000;
const MAX_SEARCH_DEPTH = 5;
const ASSERTION_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

let sdkInit: Promise<boolean> | null = null;
let cached: { assertion: string; reuseUntil: number } | null = null;
let inFlight: Promise<string | null> | null = null;
let lastFailureAt = 0;
let status: IdentityStatus = 'not_requested';

/** Initializes the Zoho People Widget SDK once; resolves false outside Zoho People. */
export function initWebTabSdk(): Promise<boolean> {
  if (sdkInit) return sdkInit;

  const app = window.ZOHO?.embeddedApp;
  if (!app || typeof app.init !== 'function') {
    sdkInit = Promise.resolve(false);
    return sdkInit;
  }

  sdkInit = new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => resolve(false), SDK_INIT_TIMEOUT_MS);
    Promise.resolve()
      .then(() => app.init())
      .then(() => resolve(true))
      .catch(() => resolve(false))
      .finally(() => window.clearTimeout(timer));
  });
  return sdkInit;
}

/** Finds the `assertion` value in the SDK response without trusting its shape. */
function findAssertion(value: unknown, depth = 0): string | null {
  if (depth > MAX_SEARCH_DEPTH || value === null || value === undefined) return null;

  if (typeof value === 'string') {
    const text = value.trim();
    if (text.startsWith('{')) {
      try {
        return findAssertion(JSON.parse(text), depth + 1);
      } catch {
        return null;
      }
    }
    return null;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const direct = record.assertion;
    if (typeof direct === 'string' && ASSERTION_SHAPE.test(direct.trim())) {
      return direct.trim();
    }
    for (const nested of Object.values(record)) {
      const found = findAssertion(nested, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

async function requestAssertion(): Promise<string | null> {
  const sdkReady = await initWebTabSdk();
  const api = window.ZOHO?.People?.API;
  if (!sdkReady || !api || typeof api.invokeStandaloneFunction !== 'function') {
    status = 'sdk_unavailable';
    return null;
  }

  try {
    const response = await api.invokeStandaloneFunction({
      fnName: IDENTITY_FUNCTION_NAME,
      params: '{}',
    });
    const assertion = findAssertion(response);
    if (!assertion) {
      status = 'function_unavailable';
      return null;
    }
    status = 'available';
    return assertion;
  } catch {
    status = 'function_unavailable';
    return null;
  }
}

/**
 * Reads the expiry the payload declares, only to know when to fetch a new one.
 * This is not verification (the backend verifies); an unreadable expiry
 * falls back to the fixed reuse window.
 */
function readExpiryMs(assertion: string): number | null {
  try {
    const part = assertion.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const padded = part + '='.repeat((4 - (part.length % 4)) % 4);
    const exp = Number(atob(padded).split('|')[5]);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function reusableUntil(assertion: string, obtainedAt: number): number {
  const byWindow = obtainedAt + ASSERTION_REUSE_MS;
  const expiryMs = readExpiryMs(assertion);
  return expiryMs === null ? byWindow : Math.min(byWindow, expiryMs - EXPIRY_MARGIN_MS);
}

/**
 * Returns a current assertion, or null when none can be obtained. Never throws;
 * the backend decides what an unauthenticated request may do.
 */
export async function getIdentityAssertion(): Promise<string | null> {
  const now = Date.now();
  if (cached && now < cached.reuseUntil) return cached.assertion;
  if (!cached && lastFailureAt && now - lastFailureAt < FAILURE_RETRY_MS) return null;
  if (inFlight) return inFlight;

  inFlight = requestAssertion()
    .then((assertion) => {
      if (assertion) {
        const obtainedAt = Date.now();
        cached = { assertion, reuseUntil: reusableUntil(assertion, obtainedAt) };
        lastFailureAt = 0;
      } else {
        cached = null;
        lastFailureAt = Date.now();
      }
      return assertion;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Drops the cached assertion (after the backend rejected it) so the next request fetches a new one. */
export function invalidateIdentityAssertion(): void {
  cached = null;
  lastFailureAt = 0;
}

/** Test-only: resets all module state. */
export function resetWebTabIdentityForTests(): void {
  sdkInit = null;
  cached = null;
  inFlight = null;
  lastFailureAt = 0;
  status = 'not_requested';
}

export function getIdentityStatus(): IdentityStatus {
  return status;
}

export function describeIdentityStatus(current: IdentityStatus = status): string {
  switch (current) {
    case 'available':
      return 'Zoho People identity assertion obtained.';
    case 'sdk_unavailable':
      return 'Zoho People Widget SDK is not available (not running inside Zoho People).';
    case 'function_unavailable':
      return `Zoho People identity function "${IDENTITY_FUNCTION_NAME}" did not return an assertion.`;
    default:
      return 'Zoho People identity has not been requested yet.';
  }
}
