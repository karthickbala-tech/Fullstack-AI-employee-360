'use strict';

const { DATASTORE_TABLE_IDS } = require('../config/constants');
const Logger = require('../utils/logger');

class EmployeeRepository {
  constructor() {
    this.tableId = DATASTORE_TABLE_IDS.Employees;
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

  _formatDateTime(value = new Date()) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid datetime value: ${value}`);
    }

    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  async findByEmployeeId(tenantId, employeeId, context = null) {
    Logger.info('Querying employee record from Data Store repository', {
      tableId: this.tableId,
      tenantId,
      employeeId
    });

    const app = this._getCatalystApp(context?.req);

    if (!app || typeof app.zcql !== 'function') {
      return null;
    }

    const safeTenantId = this._sanitizeQueryValue(tenantId);
    const safeEmployeeId = this._sanitizeQueryValue(employeeId);

    const query = `
      SELECT *
      FROM Employees
      WHERE tenantId = '${safeTenantId}'
      AND employeeId = '${safeEmployeeId}'
      LIMIT 1
    `;

    const result = await app.zcql().executeZCQLQuery(query);

    if (Array.isArray(result) && result.length > 0) {
      return result[0].Employees || result[0];
    }

    return null;
  }

  async save(employeeRecord, context = null) {
    const tenantId = context?.tenantId || employeeRecord.tenantId;
    const employeeId = String(employeeRecord.employeeId || '');

    if (!tenantId) {
      throw new Error('EmployeeRepository.save requires tenantId');
    }

    if (!employeeId) {
      throw new Error('EmployeeRepository.save requires employeeId');
    }

    if (!employeeRecord.sourceEmployeeId) {
      throw new Error('EmployeeRepository.save requires sourceEmployeeId');
    }

    const now = this._formatDateTime();

    const rowData = {
      employeeId,
      tenantId,
      employeeNumber: employeeRecord.employeeNumber || null,
      firstName: employeeRecord.firstName || null,
      lastName: employeeRecord.lastName || null,
      email: employeeRecord.email || null,
      status: employeeRecord.status || null,
      sourceEmployeeId: String(employeeRecord.sourceEmployeeId),
      createdAt: employeeRecord.createdAt
  ? this._formatDateTime(employeeRecord.createdAt)
  : now,
      updatedAt: now
    };

    Logger.info('Saving employee record into Data Store repository', {
      tableId: this.tableId,
      tenantId,
      employeeId
    });

    const app = this._getCatalystApp(context?.req);

    if (!app || typeof app.datastore !== 'function') {
      return employeeRecord;
    }

    const table = app.datastore().table(this.tableId);

    const existingRow = await this.findByEmployeeId(
      tenantId,
      employeeId,
      context
    );

    if (existingRow?.ROWID) {
      const updateData = {
        ...rowData,
        createdAt: existingRow.createdAt || rowData.createdAt
      };

      const result = await table.updateRow({
        ROWID: existingRow.ROWID,
        ...updateData
      });

      Logger.info(
        'Updated existing employee record in Catalyst Data Store',
        {
          tenantId,
          employeeId,
          rowId: existingRow.ROWID
        }
      );

      return result;
    }

    const result = await table.insertRow(rowData);

    Logger.info(
      'Inserted new employee record in Catalyst Data Store',
      {
        tenantId,
        employeeId,
        rowId: result?.ROWID || null
      }
    );

    return result;
  }
}

module.exports = EmployeeRepository;
