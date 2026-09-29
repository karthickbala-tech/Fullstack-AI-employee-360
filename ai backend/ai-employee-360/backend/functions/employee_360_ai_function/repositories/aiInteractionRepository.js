'use strict';

const { DATASTORE_TABLE_IDS } = require('../config/constants');
const Logger = require('../utils/logger');

class AIInteractionRepository {
  constructor() {
    this.tableId = DATASTORE_TABLE_IDS.AIInteractions;
  }

  async logInteraction(record) {
    Logger.info('Logging AI interaction audit in Data Store', {
      tableId: this.tableId,
      action: record.action,
      employeeId: record.employeeId
    });
    // Integration point: Stores user question, tokens used, confidence, and latency
    return record;
  }
}

module.exports = AIInteractionRepository;
