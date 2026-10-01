'use strict';

class AIContextBuilder {
  static buildPromptContext(canonical = {}) {
    const safeContext = {
      employeeId: canonical.metadata?.employeeId || canonical.employeeId || 'Unknown',
      profile: {
        fullName: canonical.employee?.fullName || 'Unknown',
        jobTitle: canonical.employment?.jobTitle || 'Unknown',
        department: canonical.organisation?.department || 'Unknown',
        location: canonical.employment?.workLocation || 'Unknown'
      },
      employment: {
        dateOfJoining: canonical.employment?.dateOfJoining || 'Unknown',
        tenure: canonical.deterministicMetrics?.tenure?.formatted || 'Unknown',
        status: canonical.employment?.employmentStatus || 'Unknown'
      },
      performance: {
        overallRating: canonical.performance?.overallRating || 'Not evaluated',
        strengths: canonical.performance?.strengths || [],
        developmentAreas: canonical.performance?.developmentAreas || []
      },
      attendance: {
        percentage: canonical.deterministicMetrics?.attendancePercentage?.formatted || 'Unknown',
        lateDays:
  canonical.deterministicMetrics?.attendancePercentage?.formatted !== 'Unknown'
    ? canonical.attendance?.lateDays
    : 'Unknown'
      },
      leave: {
        utilization: canonical.deterministicMetrics?.leaveUtilization?.formatted || 'Unknown'
      },
      knownLimitations: canonical.limitations || []
    };

    return JSON.stringify(safeContext, null, 2);
  }
}

module.exports = AIContextBuilder;
