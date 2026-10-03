'use strict';

const Environment = require('../config/environment');
const { DATASTORE_TABLE_IDS } = require('../config/constants');
const Logger = require('../utils/logger');

class TenantRepository {
  constructor() {
    this.tableId = DATASTORE_TABLE_IDS.Tenants;
  }

  async getTenantById(tenantId, context = null) {
    const defaultTenant = Environment.getTenantConfig();

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

    if (catalyst && typeof catalyst.initialize === 'function') {
      try {
        const req = context?.req || null;
        const app = req ? catalyst.initialize(req) : catalyst.initialize();
        if (typeof app.zcql === 'function') {
          const sanitizedId = String(tenantId || defaultTenant.tenantId).replace(/[^a-zA-Z0-9_-]/g, '');
          const query = `SELECT * FROM Tenants WHERE tenantId = '${sanitizedId}'`;
          const result = await app.zcql().executeZCQLQuery(query);
          if (Array.isArray(result) && result.length > 0) {
            const rowWrapper = result[0];
            return rowWrapper.Tenants || rowWrapper;
          }
        }
      } catch (zcqlErr) {
        Logger.warn('TenantRepository ZCQL lookup fallback to environment configuration', { error: zcqlErr.message });
      }
    }

    if (defaultTenant.tenantId === tenantId) {
      return defaultTenant;
    }
    return defaultTenant;
  }
}

module.exports = TenantRepository;
