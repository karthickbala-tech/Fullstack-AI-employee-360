'use strict';

const { DATASTORE_TABLE_IDS, RESERVED_COLUMN_MAP } = require('../config/constants');
const Logger = require('../utils/logger');

class Employee360Repository {
  constructor() {
    this.tableId = DATASTORE_TABLE_IDS.Employee360;
    this.columnMap = RESERVED_COLUMN_MAP.Employee360;
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

  async getLatestSnapshot(employeeId, context = null) {
    Logger.info('Fetching latest Employee360 snapshot from Data Store', {
      tableId: this.tableId,
      employeeId
    });

    try {
      const app = this._getCatalystApp(context?.req);
      if (app && typeof app.zcql === 'function') {
        const sanitizedId = String(employeeId).replace(/[^a-zA-Z0-9_-]/g, '');
        const query = `SELECT * FROM Employee360 WHERE employeeId = '${sanitizedId}' ORDER BY CREATEDTIME DESC LIMIT 1`;
        const result = await app.zcql().executeZCQLQuery(query);
        if (Array.isArray(result) && result.length > 0) {
          const row = result[0].Employee360 || result[0];
          return row;
        }
      }
    } catch (err) {
      Logger.warn('Employee360Repository ZCQL read error', { error: err.message });
    }
    return null;
  }

  async saveSnapshot(employeeId, canonicalData, context = null) {
    Logger.info('Saving Employee360 snapshot with column adaptations', {
      tableId: this.tableId,
      employeeId,
      columnKeys: Object.keys(this.columnMap)
    });

    const tenantId = context?.tenantId || 'vsk_hr_solution';
    const rowData = {
      tenantId,
      employeeId: String(employeeId),
      [this.columnMap.employee]: JSON.stringify(canonicalData.employee || {}).substring(0, 9999),
      [this.columnMap.employment]: JSON.stringify(canonicalData.employment || {}).substring(0, 9999),
      [this.columnMap.organisation]: JSON.stringify(canonicalData.organisation || {}).substring(0, 9999),
      [this.columnMap.leave]: JSON.stringify(canonicalData.leave || {}).substring(0, 9999),
      [this.columnMap.goals]: JSON.stringify(canonicalData.goals || {}).substring(0, 9999),
      [this.columnMap.skills]: JSON.stringify(canonicalData.skills || []).substring(0, 9999),
      [this.columnMap.learning]: JSON.stringify(canonicalData.learning || []).substring(0, 9999),
      [this.columnMap.career]: JSON.stringify(canonicalData.career || {}).substring(0, 9999),
      [this.columnMap.lifecycle]: JSON.stringify(canonicalData.lifecycle || {}).substring(0, 9999),
      [this.columnMap.timeline]: JSON.stringify(canonicalData.timeline || []).substring(0, 9999),
      [this.columnMap.evidence]: JSON.stringify(canonicalData.evidence || []).substring(0, 9999)
    };

    try {
      const app = this._getCatalystApp(context?.req);
      if (app && typeof app.datastore === 'function') {
        const table = app.datastore().table(this.tableId);
        const result = await table.insertRow(rowData);
        Logger.info('Successfully persisted Employee360 record to Catalyst Data Store', { employeeId });
        return result;
      }
    } catch (err) {
      Logger.error('Failed to persist Employee360 snapshot to Data Store', { error: err.message });
      throw err;
    }

    return canonicalData;
  }
}

module.exports = Employee360Repository;
