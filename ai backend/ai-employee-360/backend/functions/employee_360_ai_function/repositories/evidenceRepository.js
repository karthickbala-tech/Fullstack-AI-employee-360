'use strict';

const { DATASTORE_TABLE_IDS } = require('../config/constants');
const Logger = require('../utils/logger');

class EvidenceRepository {
  constructor() {
    this.tableId = DATASTORE_TABLE_IDS.Evidence;
  }

  async findByEmployeeId(employeeId) {
    Logger.info('Querying evidence trail from Data Store', {
      tableId: this.tableId,
      employeeId
    });
    return [];
  }

  async storeBatch(evidenceItems) {
    Logger.info('Storing evidence batch in Data Store', {
      tableId: this.tableId,
      count: evidenceItems.length
    });
    return evidenceItems;
  }
}

module.exports = EvidenceRepository;
