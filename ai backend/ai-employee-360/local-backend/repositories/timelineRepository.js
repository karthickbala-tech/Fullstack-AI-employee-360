'use strict';

const { DATASTORE_TABLE_IDS } = require('../config/constants');
const Logger = require('../utils/logger');

class TimelineRepository {
  constructor() {
    this.tableId = DATASTORE_TABLE_IDS.TimelineEvents;
  }

  async getEventsByEmployeeId(employeeId) {
    Logger.info('Querying timeline events from Data Store', {
      tableId: this.tableId,
      employeeId
    });
    return [];
  }

  async recordEvent(eventData) {
    Logger.info('Recording timeline event in Data Store', {
      tableId: this.tableId,
      type: eventData.type
    });
    return eventData;
  }
}

module.exports = TimelineRepository;
