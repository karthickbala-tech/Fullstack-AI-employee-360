'use strict';

class AIContextBuilder {
  static buildPromptContext(canonical = {}) {
    const evidence = Array.isArray(canonical.evidence)
      ? canonical.evidence.map(item => ({
          domain: item?.domain || 'Unknown',
          field: item?.field || 'Unknown',
          classification: item?.classification || 'Unknown',
          source: item?.source || 'Unknown',
          confidence: item?.confidence || 'Unknown',
          notes: item?.notes || null
        }))
      : [];

    const safeContext = {
      employeeId: canonical.metadata?.employeeId || canonical.employeeId || 'Unknown',
      profile: {
        fullName: canonical.employee?.fullName || 'Unknown',
        jobTitle: canonical.employment?.jobTitle || 'Unknown',
        department: canonical.organisation?.department || 'Unknown',
        reportingManager: canonical.organisation?.reportingManagerName || 'Unknown',
        location: canonical.employment?.workLocation || 'Unknown'
      },
      employment: {
        dateOfJoining: canonical.employment?.dateOfJoining || 'Unknown',
        tenure: canonical.deterministicMetrics?.tenure?.formatted || 'Unknown',
        status: canonical.employment?.employmentStatus || 'Unknown'
      },
      performance: {
        overallRating:
          canonical.performance?.overallRating !== null &&
          canonical.performance?.overallRating !== undefined
            ? canonical.performance.overallRating
            : 'Not evaluated',
        strengths: canonical.performance?.strengths || [],
        developmentAreas: canonical.performance?.developmentAreas || []
      },
      attendance: {
        percentage:
          canonical.deterministicMetrics?.attendancePercentage?.formatted ||
          'Unknown',
        lateDays:
          canonical.deterministicMetrics?.attendancePercentage?.formatted !== 'Unknown'
            ? canonical.attendance?.lateDays
            : 'Unknown'
      },
      leave: {
        utilization:
          canonical.deterministicMetrics?.leaveUtilization?.formatted ||
          'Unknown'
      },
      evidence,
      knownLimitations: canonical.limitations || []
    };

    return JSON.stringify(safeContext, null, 2);
  }
}

module.exports = AIContextBuilder;
