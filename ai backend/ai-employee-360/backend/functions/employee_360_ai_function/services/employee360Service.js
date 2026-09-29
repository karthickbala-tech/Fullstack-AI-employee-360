'use strict';

const ZohoPeopleEmployeeService = require('../connectors/zohoPeople/zohoPeopleEmployeeService');
const Employee360Builder = require('../intelligence/employee360Builder');
const Employee360Repository = require('../repositories/employee360Repository');
const Logger = require('../utils/logger');

class Employee360Service {
  constructor() {
    this.zohoService = new ZohoPeopleEmployeeService();
    this.repository = new Employee360Repository();
  }

  async getCanonical360(employeeId, context) {
    Logger.info(`Orchestrating Employee 360 build`, { employeeId, requestId: context.requestId });

    // 1. Fetch raw data from Zoho People connector
    const rawData = await this.zohoService.getEmployeeRawData(employeeId, context);

    // 2. Build normalized Canonical Model with deterministic metrics and evidence
    const canonical = Employee360Builder.build(employeeId, rawData);

    // 3. Persist snapshot asynchronously or on change
    try {
      await this.repository.saveSnapshot(employeeId, canonical);
    } catch (repoErr) {
      Logger.warn('Snapshot repository caching skipped', { message: repoErr.message });
    }

    return canonical;
  }
}

module.exports = Employee360Service;
