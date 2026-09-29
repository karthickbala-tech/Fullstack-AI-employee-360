'use strict';

const Environment = require('../../config/environment');
const ZohoPeopleEnvironment = require('./zohoPeopleEnvironment');
const { ExternalServiceError, ConfigurationError } = require('../../utils/errors');
const Logger = require('../../utils/logger');

class ZohoPeopleClient {
  constructor(tenantConfig = null) {
    this.tenantConfig = tenantConfig || Environment.getTenantConfig();
    this.connectionName = this.tenantConfig.connectionName || 'zohopeople_employee360';
  }

  getBaseUrl(dc = null) {
    return ZohoPeopleEnvironment.getBaseUrl(dc || this.tenantConfig.dataCenter);
  }

  /**
   * Resolves the access token using the officially configured Catalyst Connection:
   * zohopeople_employee360 via zcatalyst-sdk-node.
   */
  async _resolveConnectionToken(req = null) {
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
        { requiredPackage: 'zcatalyst-sdk-node', connectionName: this.connectionName }
      );
    }

    try {
      const app = req ? catalyst.initialize(req) : catalyst.initialize();
      if (!app || typeof app.connection !== 'function') {
        throw new ConfigurationError(
          `Initialized Catalyst app does not support the .connection() interface.`,
          { connectionName: this.connectionName }
        );
      }

      const connection = app.connection({ connectionName: this.connectionName });
      const connector = await connection.getConnector();
      const accessToken = await connector.getAccessToken();

      if (!accessToken) {
        throw new ExternalServiceError(
          `Catalyst Connection '${this.connectionName}' failed to return an access token. Verify the connection status in Catalyst Console.`
        );
      }

      return accessToken;
    } catch (sdkErr) {
      if (sdkErr instanceof ConfigurationError || sdkErr instanceof ExternalServiceError) {
        throw sdkErr;
      }
      throw new ExternalServiceError(
        `Failed to obtain access token from Catalyst Connection '${this.connectionName}': ${sdkErr.message}`
      );
    }
  }

  /**
   * Dispatches request to Zoho People API with access token from Catalyst Connection
   */
  async request(path, options = {}) {
    const dc = options.dataCenter || this.tenantConfig.dataCenter;
    const baseUrl = this.getBaseUrl(dc);
    const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
    const req = options.req || options.context?.req || null;

    const accessToken = await this._resolveConnectionToken(req);

    const headers = {
      'Accept': 'application/json',
      'Authorization': `Zoho-oauthtoken ${accessToken}`,
      ...(options.headers || {})
    };

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });

      const rawText = await response.text();
      let data = null;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        data = { rawText };
      }

      // Check Zoho-specific error response format
      if (data && data.response && data.response.errors) {
        const errObj = data.response.errors;
        const errCode = errObj.code;
        const errMsg = errObj.message || 'Zoho People API Error';

        if (errCode === 7202 || errCode === 7203 || errCode === 7000) {
          const authErr = new ExternalServiceError(`Zoho People Authentication Failed: ${errMsg}`);
          authErr.isAuthError = true;
          authErr.zohoCode = errCode;
          throw authErr;
        }

        const apiErr = new ExternalServiceError(`Zoho People Error (${errCode}): ${errMsg}`);
        apiErr.zohoCode = errCode;
        throw apiErr;
      }

      if (!response.ok) {
        const httpErr = new ExternalServiceError(`Zoho People returned HTTP ${response.status}: ${rawText.slice(0, 200)}`);
        httpErr.statusCode = response.status;
        throw httpErr;
      }

      return data;
    } catch (err) {
      if (err instanceof ExternalServiceError || err instanceof ConfigurationError) throw err;
      Logger.error('Failed to communicate with Zoho People API', err, { url });
      throw new ExternalServiceError(`Unable to reach Zoho People API: ${err.message}`);
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
