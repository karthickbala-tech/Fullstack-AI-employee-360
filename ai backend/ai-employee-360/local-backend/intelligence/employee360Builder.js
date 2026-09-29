'use strict';

const Employee360Model = require('../models/employee360Model');
const MetricsService = require('./metricsService');
const TrendService = require('./trendService');
const TimelineIntelligenceService = require('./timelineService');
const EvidenceService = require('./evidenceService');

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

    // Direct real-time mapping from Zoho People Form schema
    canonical.employee.firstName = p.FirstName || p.firstName || null;
    canonical.employee.lastName = p.LastName || p.lastName || null;
    canonical.employee.fullName = p.Employeename || p['Employee Name'] || p.fullName ||
      (`${canonical.employee.firstName || ''} ${canonical.employee.lastName || ''}`.trim() || null);
    canonical.employee.email = p.EmailID || p['Email ID'] || p.email || null;
    canonical.employee.phone = p.Mobile || p['Mobile'] || p.phone || null;
    canonical.employee.avatarUrl = p.Photo || p['Photo'] || p.avatarUrl || null;

    canonical.employment.jobTitle = p.Designation || p['Designation'] || p.jobTitle || null;
    canonical.employment.employeeType = p.Employeetype || p['Employee Type'] || p.employeeType || null;
    canonical.employment.dateOfJoining = p.Dateofjoining || p['Date of joining'] || p.dateOfJoining || null;
    canonical.employment.workLocation = p.LocationName || p['Location Name'] || p.workLocation || null;
    canonical.employment.employmentStatus = p.EMPLOYEESTATUS || p['Employee Status'] || p.employmentStatus || 'Active';

    canonical.organisation.department = p.Department || p['Department'] || p.department || null;
    canonical.organisation.reportingManagerName = p.Reporting_To || p['Reporting To'] || p.reportingManagerName || null;

    // Real-time attendance from Zoho People if provided
    if (rawZohoData.attendance) {
      const att = rawZohoData.attendance;
      canonical.attendance.totalWorkingDays = Number(att.total_days || att['Total Days'] || 0);
      canonical.attendance.presentDays = Number(att.present_days || att['Present Days'] || 0);
      canonical.attendance.absentDays = Number(att.absent_days || att['Absent Days'] || 0);
      canonical.attendance.lateDays = Number(att.late_days || att['Late Days'] || 0);
      if (canonical.attendance.totalWorkingDays > 0) {
        canonical.attendance.attendancePercentage = Math.round((canonical.attendance.presentDays / canonical.attendance.totalWorkingDays) * 100);
      }
    }

    // Real-time leave from Zoho People if provided
    if (rawZohoData.leave) {
      const lv = rawZohoData.leave;
      if (Array.isArray(lv)) {
        canonical.leave.balance = lv.map(item => ({
          type: item.Leave_Type || item.name || 'Leave',
          balance: Number(item.Balance_Count || item.balance || 0),
          taken: Number(item.Taken_Count || item.taken || 0)
        }));
      }
    }

    // Attach deterministic code-calculated metrics strictly from real data
    canonical.deterministicMetrics = MetricsService.calculate(canonical);

    // Attach trends strictly from real data
    canonical.trends = TrendService.evaluate(canonical);

    // Build timeline from real-time events
    canonical.timeline = TimelineIntelligenceService.buildEvents(canonical);

    // Attach evidence trail of actual Zoho People source fields
    canonical.evidence = EvidenceService.extractEvidence(canonical);

    return canonical;
  }
}

module.exports = Employee360Builder;
