'use strict';

const crypto = require('crypto');
const Environment = require('../config/environment');

class RequestContext {
  static create(req) {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const tenantConfig = Environment.getTenantConfig();
    const dataCenter = req.headers['x-zoho-datacenter'] || tenantConfig.dataCenter || 'in';

    return {
      req, // Preserve req for catalyst.initialize(req)
      requestId,
      clientIp,
      tenantId: tenantConfig.tenantId,
      portalId: tenantConfig.portalId,
      dataCenter,
      timestamp: new Date().toISOString(),
      user: null
    };
  }
}

module.exports = RequestContext;
