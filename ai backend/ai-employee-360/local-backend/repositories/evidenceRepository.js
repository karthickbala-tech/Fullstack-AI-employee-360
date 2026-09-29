'use strict';

const { DATASTORE_TABLE_IDS } = require('../config/constants');
const Logger = require('../utils/logger');

class EvidenceRepository {
  constructor() {
    this.tableId = DATASTORE_TABLE_IDS.Evidence;
  }

  _getCatalystApp(req = null) {
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
      return req ? catalyst.initialize(req) : catalyst.initialize();
    }
    return null;
  }

  async findByEmployeeId(employeeId, context = null) {
    Logger.info('Querying evidence trail from Data Store', {
      tableId: this.tableId,
      employeeId
    });

    try {
      const app = this._getCatalystApp(context?.req);
      if (app && typeof app.zcql === 'function') {
        const sanitizedId = String(employeeId).replace(/[^a-zA-Z0-9_-]/g, '');
        const query = `SELECT * FROM Evidence WHERE employeeId = '${sanitizedId}'`;
        const result = await app.zcql().executeZCQLQuery(query);
        if (Array.isArray(result)) {
          return result.map(r => r.Evidence || r);
        }
      }
    } catch (err) {
      Logger.warn('EvidenceRepository ZCQL query error', { error: err.message });
    }
    return [];
  }

  async storeBatch(evidenceItems, context = null) {
    if (!evidenceItems || evidenceItems.length === 0) return [];

    Logger.info('Storing evidence batch in Data Store', {
      tableId: this.tableId,
      count: evidenceItems.length
    });

    const tenantId = context?.tenantId || 'vsk_hr_solution';
    const rows = evidenceItems.map(item => ({
      tenantId,
      employeeId: String(item.employeeId || context?.employeeId || ''),
      domain: item.domain || 'general',
      field: item.field || 'unknown',
      value: String(item.value || '').substring(0, 9999),
      classification: item.classification || 'Fact',
      source: item.source || 'zoho_people',
      createdAt: new Date().toISOString()
    }));

    try {
      const app = this._getCatalystApp(context?.req);
      if (app && typeof app.datastore === 'function') {
        const table = app.datastore().table(this.tableId);
        const result = await table.insertRows(rows);
        return result;
      }
    } catch (err) {
      Logger.error('EvidenceRepository insertRows failure', { error: err.message });
      throw err;
    }

    return evidenceItems;
  }
}

module.exports = EvidenceRepository;
