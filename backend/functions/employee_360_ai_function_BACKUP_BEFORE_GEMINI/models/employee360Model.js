'use strict';

class Employee360Model {
  static createDefault(employeeId) {
    return {
      metadata: {
        employeeId,
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
        totalWorkingDays: 0,
        presentDays: 0,
        absentDays: 0,
        lateDays: 0,
        attendancePercentage: 0,
        recentPunches: []
      },
      leave: {
        balance: [],
        takenThisYear: 0,
        pendingApprovals: 0,
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
        totalGoals: 0,
        completedGoals: 0,
        inProgressGoals: 0,
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
        onboardingCompleted: true,
        currentStage: 'Active',
        exitInitiated: false,
        exitDate: null
      },
      deterministicMetrics: {},
      evidence: [],
      limitations: []
    };
  }
}

module.exports = Employee360Model;
