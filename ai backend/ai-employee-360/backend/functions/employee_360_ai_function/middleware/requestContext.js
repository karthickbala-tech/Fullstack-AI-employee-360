'use strict';

const crypto = require('crypto');
const Environment = require('../config/environment');

class RequestContext {
  static create(req) {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const tenantConfig = Environment.getTenantConfig();
    const authHeader = req.headers['authorization'] || '';

    let zohoToken = req.headers['x-zoho-auth-token'] || req.headers['x-zoho-token'] || null;

    if (!zohoToken && authHeader.startsWith('Zoho-oauthtoken ')) {
      zohoToken = authHeader.replace('Zoho-oauthtoken ', '').trim();
    }

    if (!zohoToken && req.url && req.url.includes('zoho_token=')) {
      try {
        const u = new URL(req.url, 'http://localhost');
        zohoToken = u.searchParams.get('zoho_token');
      } catch (e) {
        // Ignore parse error
      }
    }

    const dataCenter = req.headers['x-zoho-datacenter'] || tenantConfig.dataCenter || 'in';

    return {
      requestId,
      clientIp,
      tenantId: tenantConfig.tenantId,
      portalId: tenantConfig.portalId,
      dataCenter,
      timestamp: new Date().toISOString(),
      user: null,
      zohoToken: (zohoToken || process.env.ZOHO_PEOPLE_AUTH_TOKEN || null)
    };
  }
}

module.exports = RequestContext;
