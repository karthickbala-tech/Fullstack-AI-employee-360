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

    // Metrics calculated from source counts; evidence only when the calculation succeeded.
    const calculatedMetrics = [
      {
        domain: 'attendance',
        field: 'attendancePercentage',
        metric: canonical.deterministicMetrics?.attendancePercentage,
        source: 'Calculated from Zoho People attendance summary',
        notes: 'Attendance percentage calculated deterministically from present and total working days.'
      },
      {
        domain: 'leave',
        field: 'leaveUtilization',
        metric: canonical.deterministicMetrics?.leaveUtilization,
        source: 'Calculated from Zoho People leave balances',
        notes: 'Leave utilization calculated deterministically from leave taken and entitled.'
      }
    ];

    for (const item of calculatedMetrics) {
      if (!item.metric || item.metric.value === null || item.metric.value === undefined) continue;

      evidenceList.push(new EvidenceItem({
        domain: item.domain,
        field: item.field,
        source: item.source,
        classification: DATA_CLASSIFICATION.CALCULATION,
        sourceRecordId: canonical.metadata.employeeId,
        confidence: 'high',
        notes: item.notes
      }).toJSON());

      evidenceList[evidenceList.length - 1].value = item.metric.formatted;
    }

    // Employee form fields copied verbatim into the canonical model; evidence
    // exists only when Zoho People actually supplied the value.
    const employeeFormFields = [
      {
        domain: 'organisation',
        field: 'department',
        value: canonical.organisation?.department,
        notes: 'Department directly obtained from Zoho People employee record.'
      },
      {
        domain: 'employment',
        field: 'jobTitle',
        value: canonical.employment?.jobTitle,
        notes: 'Designation directly obtained from Zoho People employee record.'
      },
      {
        domain: 'employment',
        field: 'employmentStatus',
        value: canonical.employment?.employmentStatus,
        notes: 'Employee status directly obtained from Zoho People employee record.'
      },
      {
        domain: 'organisation',
        field: 'reportingManagerName',
        value: canonical.organisation?.reportingManagerName,
        notes: 'Reporting To value directly obtained from Zoho People employee record.'
      }
    ];

    for (const item of employeeFormFields) {
      if (!item.value) continue;

      evidenceList.push(new EvidenceItem({
        domain: item.domain,
        field: item.field,
        source: 'Zoho People (Employee Form)',
        classification: DATA_CLASSIFICATION.FACT,
        sourceRecordId: canonical.metadata.employeeId,
        confidence: 'high',
        notes: item.notes
      }).toJSON());

      evidenceList[evidenceList.length - 1].value = item.value;
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
