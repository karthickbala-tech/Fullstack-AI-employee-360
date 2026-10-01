'use strict';

const crypto = require('crypto');
const { DATASTORE_TABLE_IDS } = require('../config/constants');
const Logger = require('../utils/logger');

class TimelineRepository {
  constructor() {
    this.tableId = DATASTORE_TABLE_IDS.TimelineEvents;
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

    return date.toISOString()
      .slice(0, 19)
      .replace('T', ' ');
  }

  _buildEventId({
    tenantId,
    employeeId,
    eventType,
    eventDate,
    sourceRecordId
  }) {
    const identity = [
      tenantId,
      employeeId,
      eventType,
      eventDate,
      sourceRecordId || ''
    ].join('|');

    return crypto
      .createHash('sha256')
      .update(identity)
      .digest('hex');
  }

  _mapStoredEvent(row) {
    return {
      id: row.eventId,
      type: row.eventType,
      title: row.eventType,
      date: row.eventDate,
      description: row.description || null,
      source: row.source || null,
      sourceRecordId: row.sourceRecordId || null
    };
  }

  async _findByEventId(eventId, context = null) {
    const app = this._getCatalystApp(context?.req);

    if (!app || typeof app.zcql !== 'function') {
      return null;
    }

    const safeEventId = this._sanitizeQueryValue(eventId);

    const query = `
      SELECT *
      FROM TimelineEvents
      WHERE eventId = '${safeEventId}'
      LIMIT 1
    `;

    const result = await app.zcql().executeZCQLQuery(query);

    if (Array.isArray(result) && result.length > 0) {
      return result[0].TimelineEvents || result[0];
    }

    return null;
  }

  async getEventsByEmployeeId(employeeId, context = null) {
    const tenantId = context?.tenantId || 'vsk_hr_solution';

    Logger.info('Querying timeline events from Data Store', {
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
        FROM TimelineEvents
        WHERE tenantId = '${safeTenantId}'
        AND employeeId = '${safeEmployeeId}'
        ORDER BY eventDate DESC
      `;

      const result = await app.zcql().executeZCQLQuery(query);

      if (Array.isArray(result)) {
        return result.map(row =>
          this._mapStoredEvent(row.TimelineEvents || row)
        );
      }
    } catch (err) {
      Logger.warn('TimelineRepository ZCQL query error', {
        error: err.message,
        tenantId,
        employeeId
      });
    }

    return [];
  }

  async recordEvent(eventData, context = null) {
    const tenantId = context?.tenantId || 'vsk_hr_solution';
    const employeeId = String(
      eventData.employeeId ||
      context?.employeeId ||
      ''
    );

    const eventType = eventData.type || eventData.eventType || 'GENERAL';
    const eventDate = this._formatDateTime(
      eventData.date || eventData.eventDate
    );

    if (!eventDate) {
      throw new Error('Timeline event requires a valid event date');
    }

    const sourceRecordId = eventData.sourceRecordId || eventData.id || null;

    const eventId = this._buildEventId({
      tenantId,
      employeeId,
      eventType,
      eventDate,
      sourceRecordId
    });

    const row = {
      eventId,
      tenantId,
      employeeId,
      eventType,
      eventDate,
      description: eventData.description || null,
      source: eventData.source || 'employee_360',
      sourceRecordId: sourceRecordId
        ? String(sourceRecordId)
        : null
    };

    Logger.info('Persisting timeline event', {
      tableId: this.tableId,
      tenantId,
      employeeId,
      eventId
    });

    const app = this._getCatalystApp(context?.req);

    if (!app || typeof app.datastore !== 'function') {
      return eventData;
    }

    const table = app.datastore().table(this.tableId);
    const existingRow = await this._findByEventId(eventId, context);

    if (existingRow?.ROWID) {
      const result = await table.updateRow({
        ROWID: existingRow.ROWID,
        ...row
      });

      Logger.info('Updated existing timeline event', {
        eventId,
        rowId: existingRow.ROWID,
        employeeId
      });

      return result;
    }

    const result = await table.insertRow(row);

    Logger.info('Inserted new timeline event', {
      eventId,
      rowId: result?.ROWID || null,
      employeeId
    });

    return result;
  }
}

module.exports = TimelineRepository;