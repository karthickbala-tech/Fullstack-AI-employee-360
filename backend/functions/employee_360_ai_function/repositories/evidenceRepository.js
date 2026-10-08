'use strict';

const crypto = require('crypto');
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

  _sanitizeQueryValue(value) {
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
  }

  _formatDateTime(value) {
    if (!value) return null;

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  _buildEvidenceId({
    tenantId,
    employeeId,
    domain,
    field,
    sourceRecordId
  }) {
    const identity = [
      tenantId,
      employeeId,
      domain,
      field,
      sourceRecordId || ''
    ].join('|');

    return crypto
      .createHash('sha256')
      .update(identity)
      .digest('hex');
  }

  async _findByEvidenceId(evidenceId, context = null) {
    const app = this._getCatalystApp(context?.req);

    if (!app || typeof app.zcql !== 'function') {
      return null;
    }

    const safeEvidenceId = this._sanitizeQueryValue(evidenceId);

    const query = `
      SELECT *
      FROM Evidence
      WHERE evidenceId = '${safeEvidenceId}'
      LIMIT 1
    `;

    const result = await app.zcql().executeZCQLQuery(query);

    if (Array.isArray(result) && result.length > 0) {
      return result[0].Evidence || result[0];
    }

    return null;
  }

  async findByEmployeeId(employeeId, context = null) {
    const tenantId = context?.tenantId || 'vsk_hr_solution';

    Logger.info('Querying evidence records from Data Store', {
      tableId: this.tableId,
      tenantId,
      employeeId
    });

    try {
      const app = this._getCatalystApp(context?.req);

      if (!app || typeof app.zcql !== 'function') {
        return [];
      }

      const safeEmployeeId = this._sanitizeQueryValue(employeeId);
      const safeTenantId = this._sanitizeQueryValue(tenantId);

      const query = `
        SELECT *
        FROM Evidence
        WHERE tenantId = '${safeTenantId}'
        AND employeeId = '${safeEmployeeId}'
        ORDER BY CREATEDTIME DESC
      `;

      const result = await app.zcql().executeZCQLQuery(query);

      if (Array.isArray(result)) {
        return result.map(row => row.Evidence || row);
      }
    } catch (err) {
      Logger.warn('EvidenceRepository ZCQL query error', {
        error: err.message,
        tenantId,
        employeeId
      });
    }

    return [];
  }

  async storeBatch(evidenceItems, context = null) {
    const tenantId = context?.tenantId || 'vsk_hr_solution';

    if (!Array.isArray(evidenceItems) || evidenceItems.length === 0) {
      return [];
    }

    const app = this._getCatalystApp(context?.req);

    if (!app || typeof app.datastore !== 'function') {
      return evidenceItems;
    }

    const table = app.datastore().table(this.tableId);
    const results = [];

    for (const item of evidenceItems) {
      const employeeId = String(
        item.employeeId || context?.employeeId || ''
      );

      if (!employeeId) {
        throw new Error('EvidenceRepository requires employeeId');
      }

      const domain = String(item.domain || '');
      const field = String(item.field || '');
      const source = String(item.source || '');
      const sourceRecordId = item.sourceRecordId
        ? String(item.sourceRecordId)
        : null;

      const evidenceId = this._buildEvidenceId({
        tenantId,
        employeeId,
        domain,
        field,
        sourceRecordId
      });

      const row = {
        evidenceId,
        tenantId,
        employeeId,
        source,
        domain,
        field,
        value: String(item.value ?? ''),
        sourceRecordId,
        observedAt: this._formatDateTime(item.observedAt),
        createdAt: this._formatDateTime(item.createdAt || new Date())
      };

      const existingRow = await this._findByEvidenceId(
        evidenceId,
        context
      );

      if (existingRow?.ROWID) {
        const contentColumns = ['source', 'domain', 'field', 'value', 'sourceRecordId'];
        const unchanged = contentColumns.every(
          column => (existingRow[column] ?? null) === (row[column] ?? null)
        );

        if (unchanged) {
          results.push(existingRow);
          continue;
        }

        const result = await table.updateRow({
          ROWID: existingRow.ROWID,
          ...row
        });

        Logger.info('Updated existing evidence record', {
          evidenceId,
          employeeId,
          rowId: existingRow.ROWID
        });

        results.push(result);
      } else {
        const result = await table.insertRow(row);

        Logger.info('Inserted new evidence record', {
          evidenceId,
          employeeId,
          rowId: result?.ROWID || null
        });

        results.push(result);
      }
    }

    return results;
  }
}

module.exports = EvidenceRepository;
