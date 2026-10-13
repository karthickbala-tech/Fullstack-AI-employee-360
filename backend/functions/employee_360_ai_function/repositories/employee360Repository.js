'use strict';

const { DATASTORE_TABLE_IDS, RESERVED_COLUMN_MAP } = require('../config/constants');
const Logger = require('../utils/logger');

// The previous implementation truncated at 9,999 characters. The real column size
// has not been verified yet, so that value is kept as the assumed limit; nothing
// is ever truncated.
const SNAPSHOT_COLUMN_MAX_CHARS = 9999;

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

  /**
   * Serializes one canonical domain for its Data Store column. Always returns valid
   * JSON: a value that exceeds the column limit is replaced by an explicit marker.
   */
  static serializeDomain(domainValue) {
    const json = JSON.stringify(domainValue);
    if (json.length <= SNAPSHOT_COLUMN_MAX_CHARS) {
      return { value: json, omitted: null };
    }
    return {
      value: JSON.stringify({ _omitted: true, reason: 'exceeds_column_limit', length: json.length }),
      omitted: { length: json.length }
    };
  }

  /**
   * Value used to decide whether a stored column changed. Evidence items default
   * `sourceTimestamp` to the build time (EvidenceItem), so the serialized evidence
   * differs on every build even when the employee data is identical; comparing it
   * as-is made every read request rewrite the snapshot row.
   */
  static comparableColumnValue(column, value) {
    if (column !== RESERVED_COLUMN_MAP.Employee360.evidence || typeof value !== 'string') {
      return value;
    }
    try {
      const items = JSON.parse(value);
      if (!Array.isArray(items)) return value;
      return JSON.stringify(items.map(item => {
        if (!item || typeof item !== 'object') return item;
        const { sourceTimestamp, ...rest } = item;
        return rest;
      }));
    } catch {
      return value;
    }
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

    const domainColumns = {};
    const omittedDomains = [];

    for (const [domain, column] of Object.entries(this.columnMap)) {
      const fallback = domain === 'skills' || domain === 'timeline' || domain === 'evidence' ? [] : {};
      const { value, omitted } = Employee360Repository.serializeDomain(canonicalData[domain] ?? fallback);
      domainColumns[column] = value;
      if (omitted) omittedDomains.push({ domain, length: omitted.length });
    }

    if (omittedDomains.length > 0) {
      Logger.warn('Employee360 snapshot domains exceed the assumed column limit and were not stored', {
        employeeId,
        tenantId,
        assumedColumnLimit: SNAPSHOT_COLUMN_MAX_CHARS,
        omittedDomains
      });
    }

    const rowData = {
      tenantId,
      employeeId: String(employeeId),
      updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      ...domainColumns
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
        const unchanged = Object.entries(domainColumns)
          .every(([column, value]) =>
            Employee360Repository.comparableColumnValue(column, existingRow[column]) ===
            Employee360Repository.comparableColumnValue(column, value));

        if (unchanged) {
          Logger.info('Employee360 snapshot unchanged; update skipped', {
            employeeId,
            tenantId,
            rowId: existingRow.ROWID
          });
          return existingRow;
        }

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
        err,
        {
          employeeId,
          tenantId
        }
      );

      throw err;
    }
  }
}

module.exports = Employee360Repository;