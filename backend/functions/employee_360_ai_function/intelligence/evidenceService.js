'use strict';

const EvidenceItem = require('../models/evidenceModel');
const { DATA_CLASSIFICATION } = require('../config/constants');

class EvidenceService {
  static extractEvidence(canonical, lifecycleData = {}) {
    const evidenceList = [];

    if (canonical.employee?.email) {
      evidenceList.push(new EvidenceItem({
        domain: 'employee',
        field: 'email',
        source: 'Zoho People (Employee Form)',
        classification: DATA_CLASSIFICATION.FACT,
        sourceRecordId: canonical.metadata.employeeId,
        confidence: 'high',
        notes: 'Email address directly obtained from Zoho People employee record.'
      }).toJSON());

      evidenceList[evidenceList.length - 1].value = canonical.employee.email;
    }

    if (canonical.employment?.dateOfJoining) {
      evidenceList.push(new EvidenceItem({
        domain: 'employment',
        field: 'dateOfJoining',
        source: 'Zoho People (Employment Record)',
        classification: DATA_CLASSIFICATION.FACT,
        sourceRecordId: canonical.metadata.employeeId,
        confidence: 'high',
        notes: 'Date of joining directly obtained from Zoho People employee record.'
      }).toJSON());

      evidenceList[evidenceList.length - 1].value =
        canonical.employment.dateOfJoining;
    }

    if (canonical.deterministicMetrics?.tenure?.formatted !== 'Unknown') {
      evidenceList.push(new EvidenceItem({
        domain: 'employment',
        field: 'tenure',
        source: 'Calculated from dateOfJoining',
        classification: DATA_CLASSIFICATION.CALCULATION,
        sourceRecordId: canonical.metadata.employeeId,
        confidence: 'high',
        notes: 'Tenure calculated deterministically from the employee date of joining.'
      }).toJSON());

      evidenceList[evidenceList.length - 1].value =
        canonical.deterministicMetrics.tenure.formatted;
    }

    if (
      canonical.performance?.overallRating !== null &&
      canonical.performance?.overallRating !== undefined
    ) {
      evidenceList.push(new EvidenceItem({
        domain: 'performance',
        field: 'overallRating',
        source: 'Zoho People Appraisal Module',
        classification: DATA_CLASSIFICATION.FACT,
        sourceRecordId: canonical.metadata.employeeId,
        confidence: 'high',
        notes: 'Overall performance rating directly obtained from the performance source.'
      }).toJSON());

      evidenceList[evidenceList.length - 1].value =
        canonical.performance.overallRating;
    }

    const lifecycleEvidence = [
      {
        formLinkName: 'zp_resignation',
        field: 'resignationInitiated',
        note: 'A matching resignation record was directly obtained from the Zoho People resignation form.'
      },
      {
        formLinkName: 'zp_termination',
        field: 'terminationRecorded',
        note: 'A matching termination record was directly obtained from the Zoho People termination form.'
      },
      {
        formLinkName: 'zp_deceased',
        field: 'deceasedRecorded',
        note: 'A matching deceased lifecycle record was directly obtained from the Zoho People deceased form.'
      },
      {
        formLinkName: 'exitinterview',
        field: 'separationRecorded',
        note: 'A matching separation record was directly obtained from the Zoho People exit interview form.'
      }
    ];

    for (const item of lifecycleEvidence) {
      const form = lifecycleData?.[item.formLinkName];

      if (!Array.isArray(form?.records) || form.records.length === 0) {
        continue;
      }

      evidenceList.push(new EvidenceItem({
        domain: 'lifecycle',
        field: item.field,
        source: `Zoho People (${item.formLinkName} Form)`,
        classification: DATA_CLASSIFICATION.FACT,
        sourceRecordId: null,
        confidence: 'high',
        notes: item.note
      }).toJSON());

      evidenceList[evidenceList.length - 1].value = true;
    }

    return evidenceList;
  }
}

module.exports = EvidenceService;
