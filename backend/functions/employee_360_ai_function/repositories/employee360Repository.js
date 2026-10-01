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

  _sanitizeQueryValue(value) {
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
  }

  async _findLatestSnapshot(employeeId, tenantId, context = null) {
    const app = this._getCatalystApp(context?.req);

    if (!app || typeof app.zcql !== 'function') {
      return null;
    }

    const safeEmployeeId = this._sanitizeQueryValue(employeeId);
    const safeTenantId = this._sanitizeQueryValue(tenantId);

    const query = `
      SELECT *
      FROM Employee360
      WHERE tenantId = '${safeTenantId}'
      AND employeeId = '${safeEmployeeId}'
      ORDER BY CREATEDTIME DESC
      LIMIT 1
    `;

    const result = await app.zcql().executeZCQLQuery(query);

    if (Array.isArray(result) && result.length > 0) {
      return result[0].Employee360 || result[0];
    }

    return null;
  }

  async getLatestSnapshot(employeeId, context = null) {
    const tenantId = context?.tenantId || 'vsk_hr_solution';

    Logger.info('Fetching latest Employee360 snapshot from Data Store', {
      tableId: this.tableId,
      employeeId,
      tenantId
    });

    try {
      return await this._findLatestSnapshot(employeeId, tenantId, context);
    } catch (err) {
      Logger.warn('Employee360Repository ZCQL read error', {
        error: err.message,
        employeeId,
        tenantId
      });
      return null;
    }
  }

  async saveSnapshot(employeeId, canonicalData, context = null) {
    const tenantId = context?.tenantId || 'vsk_hr_solution';

    Logger.info('Saving Employee360 snapshot', {
      tableId: this.tableId,
      employeeId,
      tenantId,
      columnKeys: Object.keys(this.columnMap)
    });

    const rowData = {
      tenantId,
      employeeId: String(employeeId),
      updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),

      [this.columnMap.employee]:
        JSON.stringify(canonicalData.employee || {}).substring(0, 9999),

      [this.columnMap.employment]:
        JSON.stringify(canonicalData.employment || {}).substring(0, 9999),

      [this.columnMap.organisation]:
        JSON.stringify(canonicalData.organisation || {}).substring(0, 9999),

      [this.columnMap.leave]:
        JSON.stringify(canonicalData.leave || {}).substring(0, 9999),

      [this.columnMap.goals]:
        JSON.stringify(canonicalData.goals || {}).substring(0, 9999),

      [this.columnMap.skills]:
        JSON.stringify(canonicalData.skills || []).substring(0, 9999),

      [this.columnMap.learning]:
        JSON.stringify(canonicalData.learning || {}).substring(0, 9999),

      [this.columnMap.career]:
        JSON.stringify(canonicalData.career || {}).substring(0, 9999),

      [this.columnMap.lifecycle]:
        JSON.stringify(canonicalData.lifecycle || {}).substring(0, 9999),

      [this.columnMap.timeline]:
        JSON.stringify(canonicalData.timeline || []).substring(0, 9999),

      [this.columnMap.evidence]:
        JSON.stringify(canonicalData.evidence || []).substring(0, 9999)
    };

    try {
      const app = this._getCatalystApp(context?.req);

      if (!app || typeof app.datastore !== 'function') {
        return canonicalData;
      }

      const table = app.datastore().table(this.tableId);

      const existingRow = await this._findLatestSnapshot(
        employeeId,
        tenantId,
        context
      );

      if (existingRow?.ROWID) {
        const result = await table.updateRow({
          ROWID: existingRow.ROWID,
          ...rowData
        });

        Logger.info(
          'Successfully updated existing Employee360 record in Catalyst Data Store',
          {
            employeeId,
            tenantId,
            rowId: existingRow.ROWID
          }
        );

        return result;
      }

      const result = await table.insertRow(rowData);

      Logger.info(
        'Successfully inserted new Employee360 record into Catalyst Data Store',
        {
          employeeId,
          tenantId,
          rowId: result?.ROWID || null
        }
      );

      return result;
    } catch (err) {
      Logger.error(
        'Failed to persist Employee360 snapshot to Data Store',
        {
          error: err.message,
          employeeId,
          tenantId
        }
      );

      throw err;
    }
  }
}

module.exports = Employee360Repository;