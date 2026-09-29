'use strict';

const Environment = require('../../config/environment');
const ZohoPeopleEnvironment = require('./zohoPeopleEnvironment');
const { ExternalServiceError } = require('../../utils/errors');
const Logger = require('../../utils/logger');

class ZohoPeopleClient {
  constructor(tenantConfig = null) {
    this.tenantConfig = tenantConfig || Environment.getTenantConfig();
  }

  getBaseUrl(dc = null) {
    return ZohoPeopleEnvironment.getBaseUrl(dc || this.tenantConfig.dataCenter);
  }

  /**
   * Dispatches request to Zoho People API with real-time OAuth token
   */
  async request(path, options = {}) {
    const dc = options.dataCenter || this.tenantConfig.dataCenter;
    const baseUrl = this.getBaseUrl(dc);
    const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

    const token = options.token ||
      (options.headers && (options.headers['x-zoho-auth-token'] || options.headers['x-zoho-token'])) ||
      process.env.ZOHO_PEOPLE_AUTH_TOKEN ||
      process.env.ZOHO_AUTH_TOKEN ||
      process.env.ZOHO_ACCESS_TOKEN ||
      null;

    const headers = {
      'Accept': 'application/json',
      ...(options.headers || {})
    };

    if (token) {
      headers['Authorization'] = token.startsWith('Zoho-oauthtoken ')
        ? token
        : `Zoho-oauthtoken ${token.trim()}`;
    }

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
      if (err instanceof ExternalServiceError) throw err;
      Logger.error('Failed to communicate with Zoho People API', err, { url });
      throw new ExternalServiceError(`Unable to reach Zoho People API: ${err.message}`);
    }
  }

  /**
   * Tests real-time connectivity to Zoho People
   */
  async verifyConnection(token, dataCenter = 'in') {
    if (!token || !token.trim()) {
      return {
        connected: false,
        error: 'Missing Zoho People token',
        message: 'No Zoho OAuth token provided.'
      };
    }

    try {
      const endpoints = ZohoPeopleEnvironment.getEndpoints(dataCenter);
      const res = await this.request(endpoints.employeeList, {
        token,
        dataCenter
      });

      const records = res?.response?.result || res?.result || [];
      const count = Array.isArray(records) ? records.length : (records ? 1 : 0);

      return {
        connected: true,
        dataCenter,
        portalId: this.tenantConfig.portalId,
        organizationName: this.tenantConfig.tenantName,
        activeRecordsCount: count,
        message: 'Real-time Zoho People connection verified successfully.'
      };
    } catch (err) {
      return {
        connected: false,
        dataCenter,
        error: err.message,
        isAuthError: Boolean(err.isAuthError),
        message: err.message
      };
    }
  }
}

module.exports = ZohoPeopleClient;
