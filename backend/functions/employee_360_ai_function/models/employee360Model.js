'use strict';

class Employee360Model {
  static createDefault(employeeId) {
    return {
      metadata: {
        employeeId,
        sourceRecordId: null,
        schemaVersion: '1.0.0',
        builtAt: new Date().toISOString(),
        tenantId: 'vsk_hr_solution'
      },
      employee: {
        employeeId,
        firstName: null,
        lastName: null,
        fullName: null,
        email: null,
        phone: null,
        avatarUrl: null
      },
      employment: {
        jobTitle: null,
        employeeType: null,
        employmentStatus: null,
        dateOfJoining: null,
        confirmationDate: null,
        workLocation: null,
        workShift: null,
        probationStatus: null
      },
      organisation: {
        department: null,
        division: null,
        reportingManagerId: null,
        reportingManagerName: null,
        reportingManagerEmail: null,
        secondaryManagerName: null
      },
      attendance: {
        summaryPeriod: null,
        totalWorkingDays: null,
        presentDays: null,
        absentDays: null,
        lateDays: null,
        attendancePercentage: null,
        recentPunches: []
      },
      leave: {
        balance: [],
        takenThisYear: null,
        pendingApprovals: null,
        recentRequests: []
      },
      performance: {
        currentReviewPeriod: null,
        overallRating: null,
        historicalRatings: [],
        strengths: [],
        developmentAreas: [],
        reviewStatus: null
      },
      goals: {
        totalGoals: null,
        completedGoals: null,
        inProgressGoals: null,
        items: []
      },
      skills: {
        technical: [],
        competencies: [],
        skillGaps: []
      },
      learning: {
        enrolledCourses: [],
        completedCourses: [],
        certifications: []
      },
      career: {
        promotions: [],
        roleChanges: [],
        aspirations: null
      },
      lifecycle: {
        onboardingCompleted: null,
        currentStage: null,
        exitInitiated: null,
        exitDate: null
      },
      deterministicMetrics: {},
      evidence: [],
      limitations: []
    };
  }
}

module.exports = Employee360Model;
