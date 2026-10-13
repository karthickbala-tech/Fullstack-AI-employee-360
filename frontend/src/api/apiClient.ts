import { API_TIMEOUT_MS } from '../config/apiConfig';
import type { ApiResponseEnvelope } from '../types/employee360';
import { getIdentityAssertion, invalidateIdentityAssertion, isZohoPeopleHost } from '../services/webTabIdentity';

// Body field that carries the Zoho People identity assertion. The backend also
// accepts the x-e360-assertion header, but a custom header makes the browser
// send a CORS preflight, which the Catalyst gateway answers without CORS
// headers, so the Web Tab never uses it.
export const IDENTITY_ASSERTION_FIELD = 'e360Assertion';

export type ApiErrorKind =
  | 'not_found'
  | 'unauthorized'
  | 'forbidden'
  | 'network_error'
  | 'backend_error'
  | 'timeout'
  | 'validation_error';

export class ApiClientError extends Error {
  public readonly kind: ApiErrorKind;
  public readonly statusCode?: number;
  public readonly code?: string;

  constructor(
    message: string,
    kind: ApiErrorKind,
    statusCode?: number,
    code?: string
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.kind = kind;
    this.statusCode = statusCode;
    this.code = code;
  }
}

function classifyHttpStatus(status: number, code?: string): ApiErrorKind {
  if (status === 404 || code === 'NOT_FOUND') return 'not_found';
  if (status === 401 || code === 'UNAUTHORIZED') return 'unauthorized';
  if (status === 403 || code === 'FORBIDDEN') return 'forbidden';
  if (status === 400 || code === 'VALIDATION_ERROR') return 'validation_error';
  return 'backend_error';
}

export const INVALID_ASSERTION_CODE = 'INVALID_IDENTITY_ASSERTION';

/**
 * Puts the assertion in the JSON body of a text/plain POST: a CORS "simple"
 * request (no preflight), never in the URL. GET reads become POST to the same
 * route, which the backend accepts for read routes.
 */
function withBodyAssertion(options: RequestInit, assertion: string): RequestInit {
  let body: Record<string, unknown> = {};
  if (typeof options.body === 'string' && options.body.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(options.body);
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ApiClientError('Request body must be a JSON object.', 'validation_error');
    }
    body = parsed as Record<string, unknown>;
  }
  return {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ ...body, [IDENTITY_ASSERTION_FIELD]: assertion }),
  };
}

/**
 * A short, plain-language message for showing an API failure to the user.
 * Codes and HTTP details stay out of the chat.
 */
export function friendlyApiError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!(error instanceof ApiClientError)) return fallback;
  if (error.code === 'RATE_LIMITED' || error.statusCode === 429) {
    return "You're sending requests quickly. Please wait a moment and try again.";
  }
  switch (error.kind) {
    case 'timeout':
      return 'That took too long to answer. Please try again.';
    case 'network_error':
      return "Can't reach the Employee 360 service. Check your connection and try again.";
    case 'unauthorized':
      return "Couldn't confirm your Zoho People sign-in. Please reload this tab and try again.";
    case 'forbidden':
      return error.message || "You don't have access to that information.";
    case 'validation_error':
      return error.message || 'That request could not be processed.';
    default:
      return error.statusCode === 503
        ? 'This service is not available right now. Please try again later.'
        : error.message && error.statusCode && error.statusCode < 500
          ? error.message
          : 'Something went wrong on our side. Please try again.';
  }
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = API_TIMEOUT_MS
): Promise<ApiResponseEnvelope<T>> {
  // The Zoho People identity assertion, when one is available, travels in the
  // request body (see withBodyAssertion). The backend verifies it.
  const assertion = await getIdentityAssertion();
  try {
    return await sendOnce<T>(url, options, assertion, timeoutMs);
  } catch (err) {
    // A rejected assertion (expired in transit, or replaced) is fetched again once;
    // the backend still decides whether the new one is valid.
    if (assertion && err instanceof ApiClientError && err.code === INVALID_ASSERTION_CODE) {
      invalidateIdentityAssertion();
      const fresh = await getIdentityAssertion({ force: true });
      if (fresh && fresh !== assertion) return sendOnce<T>(url, options, fresh, timeoutMs);
    }
    // Sent without identity inside Zoho People (the SDK or identity function was
    // briefly unavailable): get one now and retry once. Outside Zoho, nothing to retry.
    if (!assertion && err instanceof ApiClientError && err.statusCode === 401 && isZohoPeopleHost()) {
      const fresh = await getIdentityAssertion({ force: true });
      if (fresh) return sendOnce<T>(url, options, fresh, timeoutMs);
    }
    throw err;
  }
}

async function sendOnce<T>(
  url: string,
  options: RequestInit,
  assertion: string | null,
  timeoutMs: number
): Promise<ApiResponseEnvelope<T>> {
  const request = assertion ? withBodyAssertion(options, assertion) : options;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...request,
      headers: {
        Accept: 'application/json',
        ...(request.body ? { 'Content-Type': 'application/json' } : {}),
        ...(request.headers || {}),
      },
      signal: controller.signal,
    });

    let payload: ApiResponseEnvelope<T> | null = null;
    try {
      payload = (await response.json()) as ApiResponseEnvelope<T>;
    } catch {
      payload = null;
    }

    if (!response.ok || (payload && payload.success === false)) {
      const errorCode = payload?.error?.code;
      const errorMessage =
        payload?.error?.message ||
        `Backend API returned HTTP ${response.status} (${response.statusText || 'Error'})`;
      const kind = classifyHttpStatus(response.status, errorCode);
      throw new ApiClientError(errorMessage, kind, response.status, errorCode);
    }

    if (!payload || typeof payload !== 'object' || !('data' in payload)) {
      throw new ApiClientError(
        'Backend response did not match the expected Employee 360 API envelope.',
        'backend_error',
        response.status
      );
    }

    return payload;
  } catch (err) {
    if (err instanceof ApiClientError) {
      throw err;
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiClientError(
        'The request to the Employee 360 backend timed out. Please retry.',
        'timeout'
      );
    }
    throw new ApiClientError(
      'Unable to reach the Employee 360 backend service. Check network connectivity or CORS policy.',
      'network_error'
    );
  } finally {
    window.clearTimeout(timeoutId);
  }
}
