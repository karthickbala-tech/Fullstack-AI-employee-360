'use strict';

const Environment = require('../config/environment');

class TenantRepository {
  async getTenantById(tenantId) {
    const config = Environment.getTenantConfig();
    if (config.tenantId === tenantId) {
      return config;
    }
    return null;
  }
}

module.exports = TenantRepository;
