import { API_TIMEOUT_MS } from '../config/apiConfig';
import type { ApiResponseEnvelope } from '../types/employee360';
import { getIdentityAssertion, invalidateIdentityAssertion } from '../services/webTabIdentity';

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

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponseEnvelope<T>> {
  // The Zoho People identity assertion, when one is available, travels in the
  // request body (see withBodyAssertion). The backend verifies it.
  const assertion = await getIdentityAssertion();
  try {
    return await sendOnce<T>(url, options, assertion);
  } catch (err) {
    // A rejected assertion (expired in transit, or replaced) is fetched again once;
    // the backend still decides whether the new one is valid.
    if (assertion && err instanceof ApiClientError && err.code === INVALID_ASSERTION_CODE) {
      invalidateIdentityAssertion();
      const fresh = await getIdentityAssertion();
      if (fresh && fresh !== assertion) return sendOnce<T>(url, options, fresh);
    }
    throw err;
  }
}

async function sendOnce<T>(
  url: string,
  options: RequestInit,
  assertion: string | null
): Promise<ApiResponseEnvelope<T>> {
  const request = assertion ? withBodyAssertion(options, assertion) : options;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

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
