'use strict';

const Employee360Model = require('../models/employee360Model');
const MetricsService = require('./metricsService');
const TrendService = require('./trendService');
const TimelineIntelligenceService = require('./timelineService');
const EvidenceService = require('./evidenceService');

function textOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(num) ? num : null;
}

function firstDateOrNull(...values) {
  for (const value of values) {
    const date = textOrNull(value);
    if (date) return date;
  }
  return null;
}

function lifecycleRecords(rawLifecycle, formLinkName) {
  const form = rawLifecycle?.[formLinkName];

  if (!form || !Array.isArray(form.records)) {
    return [];
  }

  return form.records.filter(record => record && typeof record === 'object');
}

function lifecycleFormHasError(rawLifecycle, formLinkName) {
  const form = rawLifecycle?.[formLinkName];
  return Boolean(form?.error);
}

class Employee360Builder {
  static build(employeeId, rawZohoData = null) {
    const canonical = Employee360Model.createDefault(employeeId);

    // If live Zoho People data is not available, report strict status without fabricated facts
    if (!rawZohoData || rawZohoData.available === false || !rawZohoData.raw) {
      canonical.isLiveZohoData = false;
      canonical.liveSyncStatus = rawZohoData?.error || 'ZOHO_PEOPLE_UNSYNCED';
      canonical.limitations = [
        rawZohoData?.message || `No live data record found in Zoho People for employee ID: ${employeeId}.`
      ];
      canonical.deterministicMetrics = {};
      canonical.trends = [];
      canonical.timeline = [];
      canonical.evidence = [];
      return canonical;
    }

    canonical.isLiveZohoData = true;
    canonical.liveSyncStatus = 'SYNCED_REALTIME';

    const p = rawZohoData.raw;
    canonical.metadata.sourceRecordId = rawZohoData.recordId ? String(rawZohoData.recordId) : null;

    // Mapping uses the employee form field link names verified by Forms discovery
    // (GET /forms/employee/components, 2026-10-03).
    canonical.employee.firstName = textOrNull(p.FirstName);
    canonical.employee.lastName = textOrNull(p.LastName);
    canonical.employee.fullName =
      [canonical.employee.firstName, canonical.employee.lastName].filter(Boolean).join(' ') || null;
    canonical.employee.email = textOrNull(p.EmailID);
    // Work phone only. `Mobile` is the personal mobile number and is not exposed.
    canonical.employee.phone = textOrNull(p.Work_phone);
    canonical.employee.avatarUrl = textOrNull(p.Photo);

    canonical.employment.jobTitle = textOrNull(p.Designation);
    canonical.employment.employeeType = textOrNull(p.Employee_type);
    canonical.employment.dateOfJoining = textOrNull(p.Dateofjoining);
    // `LocationName` is the geographic location; `Work_location` is the seating location.
    canonical.employment.workLocation = textOrNull(p.LocationName);
    canonical.employment.employmentStatus = textOrNull(p.Employeestatus);
        // Lifecycle data is retrieved from verified Zoho People lifecycle forms.
    // Do not infer lifecycle state from unsupported employee-form fields.
    const lifecycle = rawZohoData.lifecycle || {};

    const resignationRecords = lifecycleRecords(lifecycle, 'zp_resignation');
    const terminationRecords = lifecycleRecords(lifecycle, 'zp_termination');
    const deceasedRecords = lifecycleRecords(lifecycle, 'zp_deceased');
    const exitInterviewRecords = lifecycleRecords(lifecycle, 'exitinterview');

    // Current stage comes from the verified employee status field.
    canonical.lifecycle.currentStage =
      canonical.employment.employmentStatus;

    // A resignation, termination, or deceased record is direct source evidence
    // that the corresponding lifecycle process/event exists.
    if (resignationRecords.length > 0 ||
        terminationRecords.length > 0 ||
        deceasedRecords.length > 0) {
      canonical.lifecycle.exitInitiated = true;
    } else {
      const lifecycleInitiationForms = [
        'zp_resignation',
        'zp_termination',
        'zp_deceased'
      ];

      const lifecycleInitiationSourceUnavailable =
        lifecycleInitiationForms.some(formLinkName =>
          lifecycleFormHasError(lifecycle, formLinkName)
        );

      // Only report false when all relevant lifecycle sources were
      // successfully queried and confirmed to have no matching records.
      // Source unavailable is represented as null, not false.
      canonical.lifecycle.exitInitiated =
        lifecycleInitiationSourceUnavailable ? null : false;
    }

    // Determine exit date only from verified, source-specific fields.
    const resignationExitDate = resignationRecords.length > 0
      ? firstDateOrNull(
          resignationRecords[0].Approved_last_working_date,
          resignationRecords[0].Last_working_date
        )
      : null;

    const terminationExitDate = terminationRecords.length > 0
      ? firstDateOrNull(
          terminationRecords[0].Approved_last_working_date
        )
      : null;

    const deceasedExitDate = deceasedRecords.length > 0
      ? firstDateOrNull(
          deceasedRecords[0].Deceased_date,
          deceasedRecords[0].Last_working_date
        )
      : null;

    const separationDate = exitInterviewRecords.length > 0
      ? firstDateOrNull(
          exitInterviewRecords[0].SeparationDate
        )
      : null;

    canonical.lifecycle.exitDate =
      resignationExitDate ||
      terminationExitDate ||
      deceasedExitDate ||
      separationDate ||
      null;

    canonical.organisation.department = textOrNull(p.Department);
    canonical.organisation.reportingManagerName = textOrNull(p.Reporting_To);

    // Attendance and leave: map only values the source actually provided.
    // Missing values stay null; they are never converted to 0.
    if (rawZohoData.attendance && typeof rawZohoData.attendance === 'object') {
      const att = rawZohoData.attendance;
      canonical.attendance.totalWorkingDays = numberOrNull(att.total_days ?? att['Total Days']);
      canonical.attendance.presentDays = numberOrNull(att.present_days ?? att['Present Days']);
      canonical.attendance.absentDays = numberOrNull(att.absent_days ?? att['Absent Days']);
      canonical.attendance.lateDays = numberOrNull(att.late_days ?? att['Late Days']);
      if (canonical.attendance.totalWorkingDays > 0 && canonical.attendance.presentDays !== null) {
        canonical.attendance.attendancePercentage = Math.round((canonical.attendance.presentDays / canonical.attendance.totalWorkingDays) * 100);
      }
    }

    if (Array.isArray(rawZohoData.leave)) {
      canonical.leave.balance = rawZohoData.leave
        .filter(item =>
          item &&
          typeof item === 'object' &&
          textOrNull(item.Name ?? item.Leave_Type ?? item.name)
        )
        .map(item => ({
          type: textOrNull(item.Name ?? item.Leave_Type ?? item.name),
          entitled: numberOrNull(item.PermittedCount ?? item.entitled),
          taken: numberOrNull(item.AvailedCount ?? item.Taken_Count ?? item.taken),
          balance: numberOrNull(item.BalanceCount ?? item.Balance_Count ?? item.balance)
        }));
    }

    // Attach deterministic code-calculated metrics strictly from real data
    canonical.deterministicMetrics = MetricsService.calculate(canonical);

    // Attach trends strictly from real data
    canonical.trends = TrendService.evaluate(canonical);

    /// Build timeline from real-time events and verified lifecycle records.
canonical.timeline = TimelineIntelligenceService.buildEvents(
  canonical,
  {
    resignationRecords,
    terminationRecords,
    deceasedRecords,
    exitInterviewRecords
  }
);

    // Attach evidence trail of actual Zoho People source fields
    canonical.evidence = EvidenceService.extractEvidence(canonical, lifecycle);

    return canonical;
  }
}

module.exports = Employee360Builder;



