'use strict';

const Environment = require('../../config/environment');
const ZohoPeopleEnvironment = require('./zohoPeopleEnvironment');
const {
  ExternalServiceError,
  ConfigurationError,
  NotFoundError,
  RateLimitError
} = require('../../utils/errors');
const Logger = require('../../utils/logger');

// Zoho People error codes (https://www.zoho.com/people/api/error-codes.html and Forms API pages)
const ZOHO_AUTH_CODES = new Set([7202]); // Invalid Authtoken
const ZOHO_PERMISSION_CODES = new Set([7037, 7038, 7039, 7040, 7041]); // permission denied variants
const ZOHO_NOT_FOUND_CODES = new Set([7011, 7024, 7049]); // invalid form, no records, no record for ID
const DEFAULT_TIMEOUT_MS = 15000;

class ZohoPeopleClient {
  constructor(tenantConfig = null) {
    this.tenantConfig = tenantConfig || Environment.getTenantConfig();
    this.connectionName = this.tenantConfig.connectionName || 'zohopeople_employee360_v2';
  }

  getBaseUrl(dc = null) {
    return ZohoPeopleEnvironment.getBaseUrl(dc || this.tenantConfig.dataCenter);
  }
  _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

  /**
   * Resolves the access token using the officially configured Catalyst Connection:
   * zohopeople_employee360_v2 via zcatalyst-sdk-node.
   */
    async _resolveConnectionCredentials(req = null) {
    let catalyst;

    try {
      catalyst = require('zcatalyst-sdk-node');
    } catch (e1) {
      try {
        catalyst = require('zcatalyst-sdk');
      } catch (e2) {
        catalyst = global.catalyst;
      }
    }

    if (!catalyst || typeof catalyst.initialize !== 'function') {
      throw new ConfigurationError(
        `Catalyst SDK is missing. Accessing Catalyst Connection '${this.connectionName}' requires 'zcatalyst-sdk-node' to be available.`,
        {
          requiredPackage: 'zcatalyst-sdk-node',
          connectionName: this.connectionName
        }
      );
    }

    try {
      const app = req ? catalyst.initialize(req) : catalyst.initialize();

      if (!app || typeof app.connections !== 'function') {
        throw new ConfigurationError(
          `Initialized Catalyst app does not support the Cloud Scale Connections API.`,
          {
            connectionName: this.connectionName
          }
        );
      }

      const credentials = await app.connections()
        .getConnectionCredentials(this.connectionName);

      if (!credentials || typeof credentials !== 'object') {
        throw new ExternalServiceError(
          `Catalyst Connection '${this.connectionName}' returned an invalid credential response.`
        );
      }

      if (
        (!credentials.headers || typeof credentials.headers !== 'object') &&
        (!credentials.parameters || typeof credentials.parameters !== 'object')
      ) {
        throw new ExternalServiceError(
          `Catalyst Connection '${this.connectionName}' returned no usable connection credentials.`
        );
      }

      return credentials;
    } catch (sdkErr) {
      if (
        sdkErr instanceof ConfigurationError ||
        sdkErr instanceof ExternalServiceError
      ) {
        throw sdkErr;
      }

      Logger.error('Catalyst Connection credential lookup failed', sdkErr, {
        connectionName: this.connectionName
      });

      throw new ExternalServiceError(
        `Failed to obtain credentials from Catalyst Connection '${this.connectionName}'`
      );
    }
  }

  /**
   * Parses a Zoho People JSON body without losing precision.
   * Zoho record/component IDs exceed Number.MAX_SAFE_INTEGER, so any unsafe
   * integer is returned as its exact source text (a string).
   */
  static parseJson(rawText) {
    return JSON.parse(rawText, (key, value, context) => {
      if (
        typeof value === 'number' &&
        !Number.isSafeInteger(value) &&
        context &&
        typeof context.source === 'string' &&
        /^-?\d+$/.test(context.source)
      ) {
        return context.source;
      }
      return value;
    });
  }

  /**
   * Returns { code, message } when the body carries a Zoho People error, else null.
   */
  static extractZohoError(data) {
    const errors = data?.response?.errors;
    if (!errors) return null;
    const first = Array.isArray(errors) ? errors[0] : errors;
    if (!first || typeof first !== 'object') {
      return { code: null, message: String(first || 'Unknown Zoho People error') };
    }
    const code = first.code !== undefined && first.code !== null ? Number(first.code) : null;
    return { code: Number.isFinite(code) ? code : null, message: String(first.message || '') };
  }

  /**
   * Maps a Zoho People error to an API error. The client-facing message is generic;
   * the upstream message is kept on the error for internal logging only.
   */
  static mapZohoError(code, upstreamMessage) {
    let err;
    if (ZOHO_NOT_FOUND_CODES.has(code)) {
      err = new NotFoundError('Requested Zoho People resource was not found');
    } else if (ZOHO_AUTH_CODES.has(code)) {
      err = new ExternalServiceError('Zoho People rejected the Catalyst Connection credentials');
      err.isAuthError = true;
    } else if (ZOHO_PERMISSION_CODES.has(code)) {
      err = new ExternalServiceError('Zoho People denied access for the configured connection');
      err.isPermissionError = true;
    } else if (/limit|throttl|exceed/i.test(upstreamMessage || '')) {
      err = new RateLimitError();
      err.retryable = true;
    } else {
      err = new ExternalServiceError(`Zoho People returned an error${code !== null ? ` (code ${code})` : ''}`);
    }
    err.zohoCode = code;
    err.upstreamMessage = String(upstreamMessage || '').slice(0, 300);
    return err;
  }

  static mapHttpError(status, retryAfterHeader) {
    let err;
    if (status === 429) {
      const seconds = Number(retryAfterHeader);
      err = new RateLimitError(undefined, Number.isFinite(seconds) ? seconds : null);
      err.retryable = true;
      if (Number.isFinite(seconds)) {
        err.retryAfterMs = Math.max(0, Math.min(seconds * 1000, 10000));
      }
    } else {
      err = new ExternalServiceError(`Zoho People returned HTTP ${status}`);
      err.retryable = status === 502 || status === 503 || status === 504;
      err.isAuthError = status === 401;
      err.isPermissionError = status === 403;
    }
    err.upstreamStatus = status;
    return err;
  }

  /**
   * Dispatches request to Zoho People API with access token from Catalyst Connection
   */
  async request(path, options = {}) {
    const dc = options.dataCenter || this.tenantConfig.dataCenter;
    const baseUrl = this.getBaseUrl(dc);

    let url = path.startsWith('http') ? path : `${baseUrl}${path}`;

    // Optional query parameters.
    // Existing callers that construct query strings manually remain compatible.
    if (options.params && typeof options.params === 'object') {
      const searchParams = new URLSearchParams();

      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }

      const queryString = searchParams.toString();

      if (queryString) {
        url += url.includes('?') ? `&${queryString}` : `?${queryString}`;
      }
    }

    const req = options.req || options.context?.req || null;
    const connectionCredentials = await this._resolveConnectionCredentials(req);

    const headers = {
      Accept: 'application/json',
      ...(connectionCredentials.headers || {}),
      ...(options.headers || {})
    };

    const method = options.method || 'GET';

    let body;

    if (options.formData && typeof options.formData === 'object') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';

      const formParams = new URLSearchParams();

      for (const [key, value] of Object.entries(options.formData)) {
        if (value !== undefined && value !== null) {
          formParams.append(key, String(value));
        }
      }

      body = formParams.toString();
    } else if (options.body !== undefined && options.body !== null) {
      if (typeof options.body === 'string') {
        body = options.body;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.body);
      }
    }

    const maxRetries = Number.isInteger(options.maxRetries)
      ? Math.max(0, Math.min(options.maxRetries, 2))
      : 2;

    const timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_TIMEOUT_MS;

    let attempt = 0;

    while (true) {
      let err;

      try {
        const response = await fetch(url, {
          method,
          headers,
          body,
          signal: AbortSignal.timeout(timeoutMs)
        });

        const rawText = await response.text();

        let data = null;

        try {
          data = ZohoPeopleClient.parseJson(rawText);
        } catch {
          data = null;
        }

        const zohoError = ZohoPeopleClient.extractZohoError(data);

        if (zohoError) {
          err = ZohoPeopleClient.mapZohoError(zohoError.code, zohoError.message);
        } else if (!response.ok) {
          err = ZohoPeopleClient.mapHttpError(response.status, response.headers.get('retry-after'));
        } else if (data === null) {
          err = new ExternalServiceError('Zoho People returned a non-JSON response');
        } else {
          return data;
        }
      } catch (fetchErr) {
        const timedOut = fetchErr && (fetchErr.name === 'TimeoutError' || fetchErr.name === 'AbortError');
        err = new ExternalServiceError(
          timedOut ? 'Zoho People request timed out' : 'Zoho People request failed: network error'
        );
        err.retryable = true;
        err.upstreamMessage = String(fetchErr?.message || '').slice(0, 300);
      }

      if (err.retryable && attempt < maxRetries) {
        const delayMs = Number.isFinite(err.retryAfterMs)
          ? err.retryAfterMs
          : Math.min(500 * Math.pow(2, attempt), 4000);

        Logger.warn('Retrying Zoho People request after transient failure', {
          url,
          method,
          attempt: attempt + 1,
          maxRetries,
          code: err.code,
          zohoCode: err.zohoCode ?? null,
          upstreamStatus: err.upstreamStatus ?? null,
          delayMs
        });

        await this._sleep(delayMs);
        attempt += 1;
        continue;
      }

      if (err instanceof NotFoundError) {
        Logger.info('Zoho People reported no matching resource', {
          url,
          method,
          zohoCode: err.zohoCode ?? null
        });
      } else {
        Logger.warn('Zoho People request failed', {
          url,
          method,
          code: err.code,
          zohoCode: err.zohoCode ?? null,
          upstreamStatus: err.upstreamStatus ?? null,
          upstreamMessage: err.upstreamMessage || null
        });
      }

      throw err;
    }
  }

  /**
   * Tests connectivity to Zoho People using the Catalyst Connection
   */
  async verifyConnection(context = null) {
    const dataCenter = context?.dataCenter || this.tenantConfig.dataCenter || 'in';
    try {
      const endpoints = ZohoPeopleEnvironment.getEndpoints(dataCenter);
      const res = await this.request(endpoints.employeeList, {
        context,
        dataCenter
      });

      const records = res?.response?.result || res?.result || [];
      const count = Array.isArray(records) ? records.length : (records ? 1 : 0);

      return {
        connected: true,
        connectionName: this.connectionName,
        dataCenter,
        portalId: this.tenantConfig.portalId,
        organizationName: this.tenantConfig.tenantName,
        activeRecordsCount: count,
        message: `Catalyst Connection '${this.connectionName}' verified successfully.`
      };
    } catch (err) {
      return {
        connected: false,
        connectionName: this.connectionName,
        dataCenter,
        error: err.message,
        isAuthError: Boolean(err.isAuthError),
        message: err.message
      };
    }
  }
}

module.exports = ZohoPeopleClient;



