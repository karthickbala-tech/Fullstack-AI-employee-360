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
        confidence: 'high'
      }).toJSON());
    }

    if (canonical.employment?.dateOfJoining) {
      evidenceList.push(new EvidenceItem({
        domain: 'employment',
        field: 'dateOfJoining',
        source: 'Zoho People (Employment Record)',
        classification: DATA_CLASSIFICATION.FACT,
        sourceRecordId: canonical.metadata.employeeId,
        confidence: 'high'
      }).toJSON());
    }

    if (canonical.deterministicMetrics?.tenure?.formatted !== 'Unknown') {
      evidenceList.push(new EvidenceItem({
        domain: 'employment',
        field: 'tenure',
        source: 'Calculated from dateOfJoining',
        classification: DATA_CLASSIFICATION.CALCULATION,
        confidence: 'high'
      }).toJSON());
    }

    if (canonical.performance?.overallRating !== null) {
      evidenceList.push(new EvidenceItem({
        domain: 'performance',
        field: 'overallRating',
        source: 'Zoho People Appraisal Module',
        classification: DATA_CLASSIFICATION.FACT,
        confidence: 'high'
      }).toJSON());
    }

    return evidenceList;
  }
}

module.exports = EvidenceService;
