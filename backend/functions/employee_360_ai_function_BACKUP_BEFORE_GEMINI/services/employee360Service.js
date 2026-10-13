'use strict';

const ZohoPeopleEmployeeService = require('../connectors/zohoPeople/zohoPeopleEmployeeService');
const Employee360Builder = require('../intelligence/employee360Builder');
const Employee360Repository = require('../repositories/employee360Repository');
const EvidenceRepository = require('../repositories/evidenceRepository');
const Logger = require('../utils/logger');

class Employee360Service {
  constructor() {
    this.zohoService = new ZohoPeopleEmployeeService();
    this.repository = new Employee360Repository();
    this.evidenceRepository = new EvidenceRepository();
  }

  async getCanonical360(employeeId, context) {
    Logger.info('Orchestrating Employee 360 build', {
      employeeId,
      requestId: context.requestId
    });

    // 1. Fetch raw data from Zoho People connector
    const rawData = await this.zohoService.getEmployeeRawData(
      employeeId,
      context
    );

    // 2. Build normalized Canonical Model with deterministic metrics,
    //    timeline and evidence
    const canonical = Employee360Builder.build(
      employeeId,
      rawData
    );

    // 3. Persist Employee360 canonical snapshot
    try {
      await this.repository.saveSnapshot(
        employeeId,
        canonical,
        context
      );
    } catch (repoErr) {
      Logger.warn('Snapshot repository caching skipped', {
        message: repoErr.message,
        employeeId
      });
    }

    // 4. Persist generated evidence records
    try {
      if (
        Array.isArray(canonical.evidence) &&
        canonical.evidence.length > 0
      ) {
        const evidenceItems = canonical.evidence.map(item => ({
          ...item,
          employeeId,
          sourceRecordId:
            item.sourceRecordId ||
            canonical.metadata?.employeeId ||
            employeeId,
          observedAt:
            item.sourceTimestamp || null
        }));

        await this.evidenceRepository.storeBatch(
          evidenceItems,
          {
            ...context,
            employeeId
          }
        );

        Logger.info('Employee evidence persistence completed', {
          employeeId,
          count: evidenceItems.length
        });
      }
    } catch (evidenceErr) {
      Logger.warn('Evidence repository persistence skipped', {
        message: evidenceErr.message,
        employeeId
      });
    }

    return canonical;
  }
}

module.exports = Employee360Service;