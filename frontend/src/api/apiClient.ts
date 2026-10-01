import config from '../config/environment';
import { ApiResponse } from '../types/api';

export class ApiError extends Error {
  public code: string;
  public status: number;
  public details?: any;

  constructor(message: string, code = 'API_ERROR', status = 500, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ApiClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(baseUrl: string = config.apiBaseUrl, timeoutMs: number = config.timeoutMs) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }

  public setBaseUrl(newUrl: string): void {
    this.baseUrl = newUrl.replace(/\/$/, '');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.baseUrl}${cleanEndpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      ...((options.headers as Record<string, string>) || {})
    };

    if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Handle specific HTTP Status Codes
      if (response.status === 401) {
        throw new ApiError('Authentication required. Session expired or missing.', 'UNAUTHORIZED', 401);
      }
      if (response.status === 403) {
        throw new ApiError('Access forbidden. You do not have permission to view this resource.', 'FORBIDDEN', 403);
      }
      if (response.status === 404) {
        throw new ApiError(`Resource not found: ${endpoint}`, 'NOT_FOUND', 404);
      }

      let payload: ApiResponse<T>;
      const rawText = await response.text();
      try {
        payload = JSON.parse(rawText);
      } catch (parseErr) {
        if (!response.ok) {
          throw new ApiError(`Backend responded with HTTP ${response.status}`, 'HTTP_ERROR', response.status);
        }
        throw new ApiError('Failed to parse backend JSON response', 'PARSE_ERROR', 500);
      }

      if (!response.ok || payload.success === false) {
        const errorMsg = payload.error?.message || `Request failed with status ${response.status}`;
        const errorCode = payload.error?.code || 'SERVER_ERROR';
        throw new ApiError(errorMsg, errorCode, response.status);
      }

      return payload.data;
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        throw new ApiError('Request timed out. Please try again.', 'TIMEOUT', 408);
      }
      if (err instanceof ApiError) {
        throw err;
      }
      throw new ApiError(err?.message || 'Network request failed', 'NETWORK_ERROR', 0);
    }
  }

  public async get<T>(endpoint: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', headers });
  }

  public async post<T>(endpoint: string, body?: any, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      headers
    });
  }
}

export const apiClient = new ApiClient();
export default apiClient;
