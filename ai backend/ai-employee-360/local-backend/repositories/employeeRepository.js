'use strict';

const { DATASTORE_TABLE_IDS } = require('../config/constants');
const Logger = require('../utils/logger');

class EmployeeRepository {
  constructor() {
    this.tableId = DATASTORE_TABLE_IDS.Employees;
  }

  async findByEmployeeId(tenantId, employeeId) {
    Logger.info('Querying employee record from Data Store repository', {
      tableId: this.tableId,
      tenantId,
      employeeId
    });
    // Integration point: Catalyst Data Store SDK query against table ID 67649000000034020
    return null;
  }

  async save(employeeRecord) {
    Logger.info('Saving employee record into Data Store repository', {
      tableId: this.tableId,
      recordId: employeeRecord.employeeId
    });
    return employeeRecord;
  }
}

module.exports = EmployeeRepository;
