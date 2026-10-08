'use strict';

const { DATASTORE_TABLE_IDS } = require('../config/constants');
const DateUtils = require('../utils/dates');
const { buildTimelineEventId } = require('../utils/identifiers');
const TimelineIntelligenceService = require('../intelligence/timelineService');
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

  /**
   * Stored eventDate keeps the calendar date exactly as the source gave it;
   * no timezone conversion is applied.
   */
  _toStoredDate(isoDate) {
    return isoDate ? `${isoDate} 00:00:00` : null;
  }

  /**
   * Maps a stored row to the API event shape. Rows whose eventType is not a known
   * event code (legacy rows written before stable IDs) return null.
   */
  _mapStoredEvent(row) {
    const definition = TimelineIntelligenceService.definitions[row.eventType];
    const date = DateUtils.toIsoDate(row.eventDate);
    if (!definition || !date) return null;

    return {
      id: row.eventId,
      eventCode: row.eventType,
      type: definition.type,
      title: definition.title,
      date,
      description: row.description || null,
      domain: definition.domain,
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
        const rows = result.map(row => row.TimelineEvents || row);
        const mapped = rows.map(row => this._mapStoredEvent(row));
        const legacy = mapped.filter(event => event === null).length;
        if (legacy > 0) {
          Logger.warn('Ignoring timeline rows without a known event code', { employeeId, legacy });
        }
        return mapped.filter(Boolean);
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

  /**
   * Upserts one generated timeline event. The event's own deterministic `id` is the
   * row key; it is recomputed only when absent, with the same identity function.
   */
  async recordEvent(eventData, context = null) {
    const tenantId = context?.tenantId || 'vsk_hr_solution';
    const employeeId = String(eventData.employeeId || context?.employeeId || '');
    const eventCode = eventData.eventCode;
    const eventDate = DateUtils.toIsoDate(eventData.date || eventData.eventDate);

    if (!eventCode || !TimelineIntelligenceService.definitions[eventCode]) {
      throw new Error('Timeline event requires a known event code');
    }

    if (!eventDate) {
      throw new Error('Timeline event requires a valid event date');
    }

    const sourceRecordId = eventData.sourceRecordId ? String(eventData.sourceRecordId) : null;

    const eventId = eventData.id || buildTimelineEventId({
      tenantId,
      employeeId,
      eventCode,
      eventDate,
      sourceRecordId
    });

    const row = {
      eventId,
      tenantId,
      employeeId,
      eventType: eventCode,
      eventDate: this._toStoredDate(eventDate),
      description: eventData.description || null,
      source: eventData.source || 'employee_360',
      sourceRecordId
    };

    const app = this._getCatalystApp(context?.req);

    if (!app || typeof app.datastore !== 'function') {
      return eventData;
    }

    const table = app.datastore().table(this.tableId);
    const existingRow = await this._findByEventId(eventId, context);

    if (existingRow?.ROWID) {
      const unchanged =
        existingRow.eventType === row.eventType &&
        DateUtils.toIsoDate(existingRow.eventDate) === eventDate &&
        (existingRow.description || null) === row.description &&
        (existingRow.source || null) === row.source &&
        (existingRow.sourceRecordId || null) === row.sourceRecordId;

      if (unchanged) {
        return existingRow;
      }

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
