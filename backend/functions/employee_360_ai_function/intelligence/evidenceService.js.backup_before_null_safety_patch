'use strict';

const EvidenceItem = require('../models/evidenceModel');
const { DATA_CLASSIFICATION } = require('../config/constants');

class EvidenceService {
  static extractEvidence(canonical) {
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

    if (canonical.performance?.overallRating !== null) {
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

    return evidenceList;
  }
}

module.exports = EvidenceService;