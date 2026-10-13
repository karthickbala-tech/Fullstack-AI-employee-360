import type {
  AskAIResponse,
  ConversationThread,
  Employee360Data,
  EmployeeDirectoryEntry,
  EmployeeDirectoryResponse,
  EmployeeInsightsResponse,
  EmployeeSummaryResponse,
  EmployeeTimelineResponse,
  ZohoConnectionStatus,
} from '../types/employee360';

/**
 * Isolated Mock / Demo Dataset for AI Employee 360 Frontend Development.
 *
 * IMPORTANT:
 * - This module provides realistic fictional Employee 360 data matching the exact
 *   backend canonical schema (Employee360Model, EvidenceItem, Summary, Insights, Timeline, Ask).
 * - It preserves strict data semantics: Fact, Calculation, Trend, Correlation, AI Insight, Unknown.
 * - It never fabricates missing fields: null values remain null and are surfaced as Unknown.
 * - It is completely isolated from `src/api/employee360Api.ts` and can be disabled by
 *   switching `DEFAULT_DATA_SOURCE_MODE` to `'live'` in `src/config/apiConfig.ts` or via the UI toggle.
 */

export const MOCK_ZOHO_STATUS: ZohoConnectionStatus = {
  connected: true,
  connectionName: 'zohopeople_employee360_v2',
  dataCenter: 'in',
  portalId: '60076299713',
  organizationName: 'VSK HR Solution Private Limited (Demo Dataset)',
  activeRecordsCount: 3,
  message:
    "Demo dataset active. Switch to 'Live Backend API' in the top bar to query the Catalyst serverless deployment directly.",
};

export const MOCK_EMPLOYEES_DIRECTORY: EmployeeDirectoryEntry[] = [
  {
    recordId: '49201800000104201',
    employeeId: 'DEMO001',
    fullName: 'Sarah Anderson',
    jobTitle: 'Senior HR Executive',
    department: 'Human Resources',
    email: 'sarah.anderson@vskhr-demo.example',
    workLocation: 'Bengaluru HQ',
    status: 'Active',
  },
  {
    recordId: '49201800000104202',
    employeeId: 'DEMO002',
    fullName: 'David Wilson',
    jobTitle: 'Software Engineer',
    department: 'Engineering',
    email: 'david.wilson@vskhr-demo.example',
    workLocation: 'Chennai Tech Park',
    status: 'Active',
  },
  {
    recordId: '49201800000104203',
    employeeId: 'DEMO003',
    fullName: 'Priya Sharma',
    jobTitle: 'Business Analyst',
    department: 'Operations',
    email: 'priya.sharma@vskhr-demo.example',
    workLocation: 'Mumbai Office',
    status: 'Active',
  },
];

export const MOCK_EMPLOYEE_360_MAP: Record<string, Employee360Data> = {
  DEMO001: {
    metadata: {
      employeeId: 'DEMO001',
      sourceRecordId: '49201800000104201',
      schemaVersion: '1.0.0',
      builtAt: '2026-10-06T09:30:00.000Z',
      tenantId: 'vsk_hr_solution',
    },
    isLiveZohoData: true,
    liveSyncStatus: 'DEMO_DATASET',
    employee: {
      employeeId: 'DEMO001',
      firstName: 'Sarah',
      lastName: 'Anderson',
      fullName: 'Sarah Anderson',
      email: 'sarah.anderson@vskhr-demo.example',
      phone: '+91 80 4120 8810',
      avatarUrl: null,
    },
    employment: {
      jobTitle: 'Senior HR Executive',
      employeeType: 'Full-Time Permanent',
      employmentStatus: 'Active',
      dateOfJoining: '2023-06-15',
      confirmationDate: '2023-12-15',
      workLocation: 'Bengaluru HQ',
      workShift: null, // Intentionally Unknown in source
      probationStatus: 'Confirmed',
    },
    organisation: {
      department: 'Human Resources',
      division: 'People & Culture',
      reportingManagerId: 'MGR014',
      reportingManagerName: 'Arjun Mehta',
      reportingManagerEmail: 'arjun.mehta@vskhr-demo.example',
      secondaryManagerName: null, // Intentionally Unknown
    },
    attendance: {
      summaryPeriod: 'FY 2026 YTD (Apr – Oct)',
      totalWorkingDays: 132,
      presentDays: 127,
      absentDays: 2,
      lateDays: 3,
      attendancePercentage: 96,
      recentPunches: [
        { date: '2026-10-06', checkIn: '09:04', checkOut: '18:12', status: 'Present' },
        { date: '2026-10-05', checkIn: '08:58', checkOut: '18:05', status: 'Present' },
        { date: '2026-10-02', checkIn: '09:19', checkOut: '18:30', status: 'Present (Late 4m)' },
        { date: '2026-10-01', checkIn: '09:01', checkOut: '17:58', status: 'Present' },
      ],
    },
    leave: {
      balance: [
        { type: 'Earned Leave', entitled: 15, taken: 6, balance: 9 },
        { type: 'Casual Leave', entitled: 8, taken: 3, balance: 5 },
        { type: 'Sick Leave', entitled: 7, taken: 1, balance: 6 },
      ],
      takenThisYear: 10,
      pendingApprovals: 0,
      recentRequests: [
        {
          id: 'LV-2026-089',
          type: 'Earned Leave',
          startDate: '2026-08-18',
          endDate: '2026-08-21',
          days: 4,
          status: 'Approved',
        },
        {
          id: 'LV-2026-041',
          type: 'Casual Leave',
          startDate: '2026-05-11',
          endDate: '2026-05-12',
          days: 2,
          status: 'Approved',
        },
      ],
    },
    performance: {
      currentReviewPeriod: 'FY 2025–2026 Annual Appraisal',
      overallRating: 4.6,
      historicalRatings: [
        { period: 'FY 2025–2026', rating: 4.6, reviewer: 'Arjun Mehta' },
        { period: 'FY 2024–2025', rating: 4.4, reviewer: 'Arjun Mehta' },
        { period: 'FY 2023–2024', rating: 4.1, reviewer: 'Arjun Mehta' },
      ],
      strengths: [
        'Enterprise HR policy governance and statutory compliance alignment',
        'Structured onboarding workflow execution across engineering & operations cohorts',
        'Cross-functional stakeholder resolution and employee relations advisory',
      ],
      developmentAreas: [
        'Advanced people analytics modeling and automated compensation benchmarking',
      ],
      reviewStatus: 'Completed & Calibrated',
    },
    goals: {
      totalGoals: 4,
      completedGoals: 3,
      inProgressGoals: 1,
      items: [
        {
          id: 'GL-101',
          title: 'Standardize Zoho People onboarding forms across 3 regional offices',
          status: 'Completed',
          progress: 100,
          dueDate: '2026-06-30',
        },
        {
          id: 'GL-102',
          title: 'Reduce new-hire 90-day onboarding query volume by 35%',
          status: 'Completed',
          progress: 100,
          dueDate: '2026-08-15',
        },
        {
          id: 'GL-103',
          title: 'Complete Q3 Mid-Year Performance Calibration audit for Operations',
          status: 'Completed',
          progress: 100,
          dueDate: '2026-09-30',
        },
        {
          id: 'GL-104',
          title: 'Publish FY27 Competency Matrix framework for People Partners',
          status: 'In Progress',
          progress: 70,
          dueDate: '2026-11-30',
        },
      ],
    },
    skills: {
      technical: [
        'Zoho People Administration',
        'HRIS Data Governance',
        'Indian Labour Law Compliance',
        'Compensation & Benefits Structuring',
        'Structured Interview Design',
      ],
      competencies: [
        'Employee Relations',
        'Policy Formulation',
        'Conflict Resolution',
        'Change Management',
      ],
      skillGaps: ['Predictive Workforce Modeling'],
    },
    learning: {
      enrolledCourses: [
        {
          title: 'People Analytics & Evidence-Based HR Decisions',
          provider: 'Internal L&D Academy',
          status: 'In Progress',
          progress: 65,
        },
      ],
      completedCourses: [
        {
          title: 'Zoho People Advanced Form & Workflow Automation',
          provider: 'Zoho Workplace Training',
          completedDate: '2026-04-18',
        },
        {
          title: 'POSH & Workplace Compliance Certification',
          provider: 'LegalHR Institute',
          completedDate: '2025-11-10',
        },
        {
          title: 'Competency-Based Performance Calibration',
          provider: 'SHRM Learning',
          completedDate: '2025-02-22',
        },
      ],
      certifications: [
        {
          name: 'SHRM-CP (Certified Professional)',
          issuer: 'Society for Human Resource Management',
          issuedDate: '2024-09-01',
        },
        {
          name: 'Certified Zoho People Administrator',
          issuer: 'Zoho Corp',
          issuedDate: '2025-03-15',
        },
      ],
    },
    career: {
      promotions: [
        {
          designation: 'Senior HR Executive',
          effectiveDate: '2025-04-01',
          notes: 'Promoted from HR Executive following FY24–25 annual review cycle.',
          sourceRecordId: 'PRM-2025-011',
        },
      ],
      roleChanges: [
        {
          fromRole: 'HR Executive',
          toRole: 'Senior HR Executive',
          effectiveDate: '2025-04-01',
          department: 'Human Resources',
        },
      ],
      aspirations: null, // Intentionally Unknown
    },
    lifecycle: {
      onboardingCompleted: true,
      currentStage: 'Active',
      exitInitiated: false,
      exitDate: null,
    },
    deterministicMetrics: {
      tenure: {
        years: 3,
        months: 3,
        totalMonths: 39,
        formatted: '3 yrs 3 mos',
        classification: 'Calculation',
      },
      attendancePercentage: {
        value: 96,
        formatted: '96%',
        classification: 'Calculation',
      },
      leaveUtilization: {
        value: 33,
        formatted: '33%',
        classification: 'Calculation',
      },
      performanceRating: {
        value: 4.6,
        formatted: '4.6 / 5.0',
        classification: 'Fact',
      },
    },
    trends: [
      {
        domain: 'performance',
        metric: 'Multi-Year Appraisal Trajectory',
        direction: 'upward',
        evidence:
          'Verified appraisal ratings increased consecutively from 4.1 (FY23–24) to 4.4 (FY24–25) and 4.6 (FY25–26).',
      },
    ],
    timeline: [
      {
        id: 'tl_demo001_promoted_20250401',
        eventCode: 'PROMOTED',
        type: 'CAREER',
        title: 'Promoted to Senior HR Executive',
        date: '2025-04-01',
        description: 'Promoted from HR Executive following FY24–25 annual review cycle.',
        domain: 'career',
        source: 'zoho_people',
        sourceRecordId: 'PRM-2025-011',
      },
      {
        id: 'tl_demo001_confirmed_20231215',
        eventCode: 'CONFIRMED',
        type: 'MILESTONE',
        title: 'Employment Confirmed',
        date: '2023-12-15',
        description: 'Completed 6-month probation period and confirmed as Full-Time Permanent.',
        domain: 'employment',
        source: 'zoho_people',
        sourceRecordId: '49201800000104201',
      },
      {
        id: 'tl_demo001_joined_20230615',
        eventCode: 'JOINED',
        type: 'LIFECYCLE',
        title: 'Joined Company',
        date: '2023-06-15',
        description: 'Joined as Senior HR Executive / HR Operations cohort at Bengaluru HQ.',
        domain: 'employment',
        source: 'zoho_people',
        sourceRecordId: '49201800000104201',
      },
    ],
    evidence: [
      {
        domain: 'employee',
        field: 'email',
        source: 'Zoho People (Employee Form)',
        classification: 'Fact',
        sourceRecordId: 'DEMO001',
        sourceTimestamp: '2026-10-06T09:30:00.000Z',
        confidence: 'high',
        notes: 'Email address directly obtained from Zoho People employee record.',
        value: 'sarah.anderson@vskhr-demo.example',
      },
      {
        domain: 'employment',
        field: 'dateOfJoining',
        source: 'Zoho People (Employment Record)',
        classification: 'Fact',
        sourceRecordId: 'DEMO001',
        sourceTimestamp: '2026-10-06T09:30:00.000Z',
        confidence: 'high',
        notes: 'Date of joining directly obtained from Zoho People employee record.',
        value: '2023-06-15',
      },
      {
        domain: 'employment',
        field: 'tenure',
        source: 'Calculated from dateOfJoining',
        classification: 'Calculation',
        sourceRecordId: 'DEMO001',
        sourceTimestamp: '2026-10-06T09:30:00.000Z',
        confidence: 'high',
        notes: 'Tenure calculated deterministically from the employee date of joining (2023-06-15).',
        value: '3 yrs 3 mos',
      },
      {
        domain: 'performance',
        field: 'overallRating',
        source: 'Zoho People Appraisal Module',
        classification: 'Fact',
        sourceRecordId: 'DEMO001',
        sourceTimestamp: '2026-10-06T09:30:00.000Z',
        confidence: 'high',
        notes: 'Overall performance rating (4.6 / 5.0) directly obtained from the performance source.',
        value: 4.6,
      },
      {
        domain: 'attendance',
        field: 'attendancePercentage',
        source: 'Calculated from Zoho People Attendance Summary',
        classification: 'Calculation',
        sourceRecordId: 'DEMO001',
        sourceTimestamp: '2026-10-06T09:30:00.000Z',
        confidence: 'high',
        notes: 'Deterministic ratio of 127 present days over 132 working days (96%).',
        value: '96%',
      },
      {
        domain: 'career',
        field: 'promotions',
        source: 'Zoho People Career History Form',
        classification: 'Fact',
        sourceRecordId: 'PRM-2025-011',
        sourceTimestamp: '2026-10-06T09:30:00.000Z',
        confidence: 'high',
        notes: 'Verified promotion record effective 2025-04-01 to Senior HR Executive.',
        value: 'Senior HR Executive (2025-04-01)',
      },
    ],
    limitations: [
      'Work shift assignment (employment.workShift) is null in the Zoho People source record.',
      'Secondary reporting manager (organisation.secondaryManagerName) is not populated.',
      'Career aspirations (career.aspirations) have not been recorded in the employee profile.',
    ],
  },

  DEMO002: {
    metadata: {
      employeeId: 'DEMO002',
      sourceRecordId: '49201800000104202',
      schemaVersion: '1.0.0',
      builtAt: '2026-10-06T09:30:00.000Z',
      tenantId: 'vsk_hr_solution',
    },
    isLiveZohoData: true,
    liveSyncStatus: 'DEMO_DATASET',
    employee: {
      employeeId: 'DEMO002',
      firstName: 'David',
      lastName: 'Wilson',
      fullName: 'David Wilson',
      email: 'david.wilson@vskhr-demo.example',
      phone: '+91 44 2819 4402',
      avatarUrl: null,
    },
    employment: {
      jobTitle: 'Software Engineer',
      employeeType: 'Full-Time Permanent',
      employmentStatus: 'Active',
      dateOfJoining: '2024-02-01',
      confirmationDate: '2024-08-01',
      workLocation: 'Chennai Tech Park',
      workShift: 'General Shift (09:30 – 18:30 IST)',
      probationStatus: 'Confirmed',
    },
    organisation: {
      department: 'Engineering',
      division: 'Platform & Integrations',
      reportingManagerId: 'MGR008',
      reportingManagerName: 'Karthick Bala',
      reportingManagerEmail: 'karthick.bala@vskhr-demo.example',
      secondaryManagerName: null,
    },
    attendance: {
      summaryPeriod: 'FY 2026 YTD (Apr – Oct)',
      totalWorkingDays: 132,
      presentDays: 124,
      absentDays: 0,
      lateDays: 5,
      attendancePercentage: 94,
      recentPunches: [
        { date: '2026-10-06', checkIn: '09:28', checkOut: '18:45', status: 'Present' },
        { date: '2026-10-05', checkIn: '09:31', checkOut: '19:02', status: 'Present' },
        { date: '2026-10-02', checkIn: '09:22', checkOut: '18:34', status: 'Present' },
      ],
    },
    leave: {
      balance: [
        { type: 'Earned Leave', entitled: 15, taken: 5, balance: 10 },
        { type: 'Casual Leave', entitled: 8, taken: 2, balance: 6 },
        { type: 'Sick Leave', entitled: 7, taken: 1, balance: 6 },
      ],
      takenThisYear: 8,
      pendingApprovals: 1,
      recentRequests: [
        {
          id: 'LV-2026-112',
          type: 'Earned Leave',
          startDate: '2026-11-12',
          endDate: '2026-11-14',
          days: 3,
          status: 'Pending Approval',
        },
      ],
    },
    performance: {
      currentReviewPeriod: 'FY 2025–2026 Annual Appraisal',
      overallRating: 4.3,
      historicalRatings: [
        { period: 'FY 2025–2026', rating: 4.3, reviewer: 'Karthick Bala' },
        { period: 'FY 2024–2025', rating: 4.0, reviewer: 'Karthick Bala' },
      ],
      strengths: [
        'Node.js backend architecture and Catalyst serverless API reliability',
        'Automated unit test coverage and schema normalization discipline',
      ],
      developmentAreas: [
        'Cross-team architectural documentation and public RFC leadership',
      ],
      reviewStatus: 'Completed',
    },
    goals: {
      totalGoals: 3,
      completedGoals: 2,
      inProgressGoals: 1,
      items: [
        {
          id: 'GL-201',
          title: 'Deliver Canonical Employee 360 Connector Layer for Zoho People',
          status: 'Completed',
          progress: 100,
          dueDate: '2026-07-31',
        },
        {
          id: 'GL-202',
          title: 'Achieve 95%+ deterministic unit test pass rate on Evidence & Timeline services',
          status: 'Completed',
          progress: 100,
          dueDate: '2026-09-15',
        },
        {
          id: 'GL-203',
          title: 'Implement multi-tenant rate limit telemetry and circuit-breaker audit logs',
          status: 'In Progress',
          progress: 80,
          dueDate: '2026-11-15',
        },
      ],
    },
    skills: {
      technical: [
        'Node.js 22',
        'TypeScript',
        'React 19',
        'Zoho Catalyst Serverless',
        'REST API Design',
      ],
      competencies: [
        'Systems Thinking',
        'Code Review Rigor',
        'Incident Triage',
      ],
      skillGaps: ['Distributed Tracing & OpenTelemetry'],
    },
    learning: {
      enrolledCourses: [
        {
          title: 'Cloud-Native Observability with OpenTelemetry',
          provider: 'Linux Foundation',
          status: 'In Progress',
          progress: 40,
        },
      ],
      completedCourses: [
        {
          title: 'Secure API Design & OWASP Top 10 Mitigation',
          provider: 'Engineering Guild',
          completedDate: '2026-03-14',
        },
        {
          title: 'Zoho Catalyst Advanced I/O Functions Deep Dive',
          provider: 'Zoho Developer Program',
          completedDate: '2025-08-29',
        },
      ],
      certifications: [
        {
          name: 'AWS Certified Developer – Associate',
          issuer: 'Amazon Web Services',
          issuedDate: '2025-01-20',
        },
      ],
    },
    career: {
      promotions: [],
      roleChanges: [],
      aspirations: null,
    },
    lifecycle: {
      onboardingCompleted: true,
      currentStage: 'Active',
      exitInitiated: false,
      exitDate: null,
    },
    deterministicMetrics: {
      tenure: {
        years: 2,
        months: 8,
        totalMonths: 32,
        formatted: '2 yrs 8 mos',
        classification: 'Calculation',
      },
      attendancePercentage: {
        value: 94,
        formatted: '94%',
        classification: 'Calculation',
      },
      leaveUtilization: {
        value: 27,
        formatted: '27%',
        classification: 'Calculation',
      },
      performanceRating: {
        value: 4.3,
        formatted: '4.3 / 5.0',
        classification: 'Fact',
      },
    },
    trends: [
      {
        domain: 'performance',
        metric: 'Appraisal Rating Progression',
        direction: 'upward',
        evidence: 'Appraisal rating improved from 4.0 in FY24–25 to 4.3 in FY25–26.',
      },
    ],
    timeline: [
      {
        id: 'tl_demo002_confirmed_20240801',
        eventCode: 'CONFIRMED',
        type: 'MILESTONE',
        title: 'Employment Confirmed',
        date: '2024-08-01',
        description: 'Employment confirmed following 6-month engineering probation review.',
        domain: 'employment',
        source: 'zoho_people',
        sourceRecordId: '49201800000104202',
      },
      {
        id: 'tl_demo002_joined_20240201',
        eventCode: 'JOINED',
        type: 'LIFECYCLE',
        title: 'Joined Company',
        date: '2024-02-01',
        description: 'Joined as Software Engineer in Platform & Integrations.',
        domain: 'employment',
        source: 'zoho_people',
        sourceRecordId: '49201800000104202',
      },
    ],
    evidence: [
      {
        domain: 'employee',
        field: 'email',
        source: 'Zoho People (Employee Form)',
        classification: 'Fact',
        sourceRecordId: 'DEMO002',
        sourceTimestamp: '2026-10-06T09:30:00.000Z',
        confidence: 'high',
        notes: 'Email address directly obtained from Zoho People employee record.',
        value: 'david.wilson@vskhr-demo.example',
      },
      {
        domain: 'employment',
        field: 'dateOfJoining',
        source: 'Zoho People (Employment Record)',
        classification: 'Fact',
        sourceRecordId: 'DEMO002',
        sourceTimestamp: '2026-10-06T09:30:00.000Z',
        confidence: 'high',
        notes: 'Date of joining directly obtained from Zoho People employee record.',
        value: '2024-02-01',
      },
      {
        domain: 'employment',
        field: 'tenure',
        source: 'Calculated from dateOfJoining',
        classification: 'Calculation',
        sourceRecordId: 'DEMO002',
        sourceTimestamp: '2026-10-06T09:30:00.000Z',
        confidence: 'high',
        notes: 'Tenure calculated deterministically from the employee date of joining (2024-02-01).',
        value: '2 yrs 8 mos',
      },
      {
        domain: 'performance',
        field: 'overallRating',
        source: 'Zoho People Appraisal Module',
        classification: 'Fact',
        sourceRecordId: 'DEMO002',
        sourceTimestamp: '2026-10-06T09:30:00.000Z',
        confidence: 'high',
        notes: 'Overall performance rating (4.3 / 5.0) directly obtained from the performance source.',
        value: 4.3,
      },
    ],
    limitations: [
      'No promotion records (career.promotions) exist in Zoho People for this employee.',
      'Career aspirations (career.aspirations) and secondary reporting manager are not recorded.',
    ],
  },

  DEMO003: {
    metadata: {
      employeeId: 'DEMO003',
      sourceRecordId: '49201800000104203',
      schemaVersion: '1.0.0',
      builtAt: '2026-10-06T09:30:00.000Z',
      tenantId: 'vsk_hr_solution',
    },
    isLiveZohoData: true,
    liveSyncStatus: 'DEMO_DATASET',
    employee: {
      employeeId: 'DEMO003',
      firstName: 'Priya',
      lastName: 'Sharma',
      fullName: 'Priya Sharma',
      email: 'priya.sharma@vskhr-demo.example',
      phone: null, // Intentionally Unknown
      avatarUrl: null,
    },
    employment: {
      jobTitle: 'Business Analyst',
      employeeType: 'Full-Time Permanent',
      employmentStatus: 'Active',
      dateOfJoining: '2024-12-01',
      confirmationDate: null, // Intentionally Unknown
      workLocation: 'Mumbai Office',
      workShift: null,
      probationStatus: null,
    },
    organisation: {
      department: 'Operations',
      division: 'Business Process Excellence',
      reportingManagerId: 'MGR002',
      reportingManagerName: 'Meera Nair',
      reportingManagerEmail: 'meera.nair@vskhr-demo.example',
      secondaryManagerName: null,
    },
    attendance: {
      summaryPeriod: null,
      totalWorkingDays: null,
      presentDays: null,
      absentDays: null,
      lateDays: null,
      attendancePercentage: null,
      recentPunches: [],
    },
    leave: {
      balance: [],
      takenThisYear: null,
      pendingApprovals: null,
      recentRequests: [],
    },
    performance: {
      currentReviewPeriod: null,
      overallRating: null,
      historicalRatings: [],
      strengths: [],
      developmentAreas: [],
      reviewStatus: null,
    },
    goals: {
      totalGoals: 2,
      completedGoals: 1,
      inProgressGoals: 1,
      items: [
        {
          id: 'GL-301',
          title: 'Map Order-to-Cash SLA bottlenecks across regional fulfillment centers',
          status: 'Completed',
          progress: 100,
          dueDate: '2026-05-30',
        },
        {
          id: 'GL-302',
          title: 'Define standardized KPI dictionary for Q4 Operations Review',
          status: 'In Progress',
          progress: 55,
          dueDate: '2026-10-31',
        },
      ],
    },
    skills: {
      technical: ['SQL Reporting', 'BPMN 2.0 Process Mapping', 'Requirements Elicitation'],
      competencies: ['Stakeholder Interviews', 'Operational Audit'],
      skillGaps: [],
    },
    learning: {
      enrolledCourses: [
        {
          title: 'Lean Six Sigma Green Belt Foundations',
          provider: 'Operations Academy',
          status: 'In Progress',
          progress: 50,
        },
      ],
      completedCourses: [
        {
          title: 'Enterprise Data Governance & Privacy Fundamentals',
          provider: 'Internal Compliance',
          completedDate: '2025-03-10',
        },
      ],
      certifications: [],
    },
    career: {
      promotions: [],
      roleChanges: [],
      aspirations: null,
    },
    lifecycle: {
      onboardingCompleted: true,
      currentStage: 'Active',
      exitInitiated: false,
      exitDate: null,
    },
    deterministicMetrics: {
      tenure: {
        years: 1,
        months: 10,
        totalMonths: 22,
        formatted: '1 yr 10 mos',
        classification: 'Calculation',
      },
      attendancePercentage: {
        value: null,
        formatted: 'Unknown',
        classification: 'Unknown',
      },
      leaveUtilization: {
        value: null,
        formatted: 'Unknown',
        classification: 'Unknown',
      },
      performanceRating: {
        value: null,
        formatted: 'Unknown',
        classification: 'Unknown',
      },
    },
    trends: [],
    timeline: [
      {
        id: 'tl_demo003_joined_20241201',
        eventCode: 'JOINED',
        type: 'LIFECYCLE',
        title: 'Joined Company',
        date: '2024-12-01',
        description: 'Joined as Business Analyst in Operations at Mumbai Office.',
        domain: 'employment',
        source: 'zoho_people',
        sourceRecordId: '49201800000104203',
      },
    ],
    evidence: [
      {
        domain: 'employee',
        field: 'email',
        source: 'Zoho People (Employee Form)',
        classification: 'Fact',
        sourceRecordId: 'DEMO003',
        sourceTimestamp: '2026-10-06T09:30:00.000Z',
        confidence: 'high',
        notes: 'Email address directly obtained from Zoho People employee record.',
        value: 'priya.sharma@vskhr-demo.example',
      },
      {
        domain: 'employment',
        field: 'dateOfJoining',
        source: 'Zoho People (Employment Record)',
        classification: 'Fact',
        sourceRecordId: 'DEMO003',
        sourceTimestamp: '2026-10-06T09:30:00.000Z',
        confidence: 'high',
        notes: 'Date of joining directly obtained from Zoho People employee record.',
        value: '2024-12-01',
      },
      {
        domain: 'employment',
        field: 'tenure',
        source: 'Calculated from dateOfJoining',
        classification: 'Calculation',
        sourceRecordId: 'DEMO003',
        sourceTimestamp: '2026-10-06T09:30:00.000Z',
        confidence: 'high',
        notes: 'Tenure calculated deterministically from the employee date of joining (2024-12-01).',
        value: '1 yr 10 mos',
      },
    ],
    limitations: [
      'Attendance summary logs are not available for DEMO003 in the current Zoho People sync; attendancePercentage remains Unknown.',
      'Leave balance entitlements are not populated in the source record; leaveUtilization remains Unknown.',
      'Annual appraisal rating (performance.overallRating) has not been recorded for the current review cycle; performanceRating remains Unknown.',
      'Work phone and confirmation date are null in the Zoho People employee form.',
    ],
  },
};

export const MOCK_SUMMARIES_MAP: Record<string, EmployeeSummaryResponse> = {
  DEMO001: {
    employeeId: 'DEMO001',
    summary:
      'Sarah Anderson (DEMO001) is recorded in Zoho People as a Senior HR Executive within the Human Resources department (People & Culture division), based at Bengaluru HQ. She joined the organization on 2023-06-15 and has a deterministically calculated tenure of 3 years and 3 months, with employment confirmed on 2023-12-15 and a verified promotion to Senior HR Executive on 2025-04-01.\n\nAcross documented performance and operational metrics, Sarah holds a verified FY 2025–2026 appraisal rating of 4.6 / 5.0 (up from 4.4 in FY24–25 and 4.1 in FY23–24), a calculated attendance rate of 96% (127 present days of 132 working days), and a 33% leave utilization rate (10 of 30 entitled days availed). She has completed 3 of 4 assigned annual goals and holds SHRM-CP and Certified Zoho People Administrator credentials.\n\nDocumented development areas focus on advanced people analytics modeling and automated compensation benchmarking. In accordance with Employee 360 evidence guardrails, work shift assignment, secondary reporting manager, and career aspirations are currently unrecorded (Unknown) in the Zoho People source record.',
    isAiGenerated: true,
    model: 'gemini-2.5-flash (Demo Grounded Synthesis)',
    evidenceCount: 6,
    limitations: MOCK_EMPLOYEE_360_MAP.DEMO001.limitations,
  },
  DEMO002: {
    employeeId: 'DEMO002',
    summary:
      'David Wilson (DEMO002) is recorded in Zoho People as a Software Engineer in the Engineering department (Platform & Integrations division) at Chennai Tech Park, reporting to Karthick Bala. Following a joining date of 2024-02-01, his deterministically calculated tenure is 2 years and 8 months, with employment confirmed on 2024-08-01.\n\nDavid holds a verified FY 2025–2026 overall appraisal rating of 4.3 / 5.0 (improved from 4.0 in FY24–25) and a calculated attendance rate of 94% (124 present days out of 132 working days) with 27% leave utilization. He has completed 2 of 3 engineering goals and holds an AWS Certified Developer – Associate credential.\n\nDocumented development areas highlight cross-team architectural documentation and public RFC leadership. Promotion records, secondary reporting manager, and career aspirations are not present in the Zoho People record and remain Unknown.',
    isAiGenerated: true,
    model: 'gemini-2.5-flash (Demo Grounded Synthesis)',
    evidenceCount: 4,
    limitations: MOCK_EMPLOYEE_360_MAP.DEMO002.limitations,
  },
  DEMO003: {
    employeeId: 'DEMO003',
    summary:
      'Priya Sharma (DEMO003) is recorded in Zoho People as a Business Analyst within the Operations department (Business Process Excellence division) at the Mumbai Office, reporting to Meera Nair. As of the current record, her employment status is listed as Active, with a deterministically calculated tenure of 1 year and 10 months following a joining date of 2024-12-01.\n\nPriya has 1 completed operational goal and 1 goal in progress, along with verified competencies in SQL Reporting, BPMN 2.0 Process Mapping, and Requirements Elicitation, plus 1 completed compliance course.\n\nAttendance logs, leave balance entitlements, and formal appraisal ratings are not populated in the current Zoho People source record for DEMO003; therefore, attendance percentage, leave utilization, and appraisal rating are strictly preserved as Unknown rather than inferred.',
    isAiGenerated: true,
    model: 'gemini-2.5-flash (Demo Grounded Synthesis)',
    evidenceCount: 3,
    limitations: MOCK_EMPLOYEE_360_MAP.DEMO003.limitations,
  },
};

export const MOCK_INSIGHTS_MAP: Record<string, EmployeeInsightsResponse> = {
  DEMO001: {
    employeeId: 'DEMO001',
    insights: [
      {
        domain: 'employment',
        type: 'Calculation',
        headline: 'Tenure Milestone',
        description: 'Employee has completed 3 yrs 3 mos of verified service since 2023-06-15.',
        confidence: 'high',
        evidence: ['employment.dateOfJoining', 'employment.tenure'],
      },
      {
        domain: 'performance',
        type: 'Trend',
        headline: 'Trend: Multi-Year Appraisal Trajectory',
        description:
          'Verified appraisal ratings increased consecutively from 4.1 (FY23–24) to 4.4 (FY24–25) and 4.6 (FY25–26).',
        confidence: 'high',
        evidence: ['performance.overallRating'],
      },
      {
        domain: 'career',
        type: 'AI Insight',
        headline: 'Role Progression & Goal Execution Alignment',
        description:
          'Following promotion to Senior HR Executive on 2025-04-01, 3 of 4 annual HR governance goals have been completed at 100% while maintaining 96% attendance.',
        confidence: 'medium',
        evidence: ['career.promotions', 'performance.overallRating', 'attendance.attendancePercentage'],
      },
    ],
    metricsSnapshot: MOCK_EMPLOYEE_360_MAP.DEMO001.deterministicMetrics,
    limitations: MOCK_EMPLOYEE_360_MAP.DEMO001.limitations,
  },
  DEMO002: {
    employeeId: 'DEMO002',
    insights: [
      {
        domain: 'employment',
        type: 'Calculation',
        headline: 'Tenure Milestone',
        description: 'Employee has completed 2 yrs 8 mos of verified service since 2024-02-01.',
        confidence: 'high',
        evidence: ['employment.dateOfJoining', 'employment.tenure'],
      },
      {
        domain: 'performance',
        type: 'Trend',
        headline: 'Trend: Appraisal Rating Progression',
        description: 'Appraisal rating improved from 4.0 in FY24–25 to 4.3 in FY25–26.',
        confidence: 'medium',
        evidence: ['performance.overallRating'],
      },
      {
        domain: 'employment',
        type: 'AI Insight',
        headline: 'Consistent Engineering Delivery & Tenure Stability',
        description:
          'Maintains a 4.3 appraisal rating and 2 yrs 8 mos tenure with core delivery across Node.js and Zoho Catalyst serverless services.',
        confidence: 'medium',
        evidence: ['employment.tenure', 'performance.overallRating'],
      },
    ],
    metricsSnapshot: MOCK_EMPLOYEE_360_MAP.DEMO002.deterministicMetrics,
    limitations: MOCK_EMPLOYEE_360_MAP.DEMO002.limitations,
  },
  DEMO003: {
    employeeId: 'DEMO003',
    insights: [
      {
        domain: 'employment',
        type: 'Calculation',
        headline: 'Verified Onboarding & Active Tenure',
        description:
          'Recorded active tenure of 1 yr 10 mos since joining on 2024-12-01 in the Operations department.',
        confidence: 'high',
        evidence: ['employment.dateOfJoining', 'employment.tenure'],
      },
    ],
    metricsSnapshot: MOCK_EMPLOYEE_360_MAP.DEMO003.deterministicMetrics,
    limitations: MOCK_EMPLOYEE_360_MAP.DEMO003.limitations,
  },
};

export const MOCK_INITIAL_CONVERSATIONS: Record<string, ConversationThread[]> = {
  DEMO001: [
    {
      id: 'conv_demo001_main',
      employeeId: 'DEMO001',
      title: 'Employee 360 Overview — Sarah Anderson',
      updatedAt: '2026-10-06T09:42:00.000Z',
      messages: [
        {
          id: 'msg_demo001_1',
          role: 'user',
          timestamp: '2026-10-06T09:41:10.000Z',
          employeeId: 'DEMO001',
          content: 'What do we know about Sarah Anderson?',
        },
        {
          id: 'msg_demo001_2',
          role: 'assistant',
          timestamp: '2026-10-06T09:41:14.000Z',
          employeeId: 'DEMO001',
          content:
            'Based on the verified Employee 360 record for **Sarah Anderson (DEMO001)**, she is an **Active** Full-Time Permanent **Senior HR Executive** in the **Human Resources** department (People & Culture division) at **Bengaluru HQ**, reporting to **Arjun Mehta**.\n\n### Verified Facts & Deterministic Calculations\n- **Tenure & Lifecycle:** Joined on `2023-06-15` (calculated tenure: **3 yrs 3 mos**), confirmed on `2023-12-15`, and promoted to Senior HR Executive on `2025-04-01`.\n- **Performance & Goals:** Holds a verified **4.6 / 5.0** overall rating in the FY 2025–2026 appraisal cycle (consecutively up from `4.1` and `4.4` in prior cycles). Completed **3 of 4** assigned goals (`100%` completion on regional onboarding standardization, query reduction, and Q3 calibration).\n- **Attendance & Leave:** Deterministically calculated attendance rate is **96%** (`127` present days out of `132` working days) and leave utilization is **33%** (`10` days taken out of `30` entitled across Earned, Casual, and Sick leave).\n- **Skills & Credentials:** Certified **SHRM-CP** and **Certified Zoho People Administrator**, with 3 completed compliance/HRIS courses and 1 course in progress (*People Analytics & Evidence-Based HR Decisions*).\n\n### Unrecorded / Unknown Attributes\nIn accordance with strict Employee 360 evidence rules, the following fields are `null` in Zoho People and remain **Unknown**:\n- Work Shift (`employment.workShift`: **Unknown**)\n- Secondary Reporting Manager (`organisation.secondaryManagerName`: **Unknown**)\n- Career Aspirations (`career.aspirations`: **Unknown**)',
          responseMeta: {
            type: 'Fact',
            confidence: 'high',
            evidence: [
              'employee.email',
              'employment.dateOfJoining',
              'employment.tenure',
              'performance.overallRating',
              'attendance.attendancePercentage',
              'career.promotions',
            ],
            limitations: MOCK_EMPLOYEE_360_MAP.DEMO001.limitations,
            knownFactsSummary: [
              {
                label: 'Role & Department',
                value: 'Senior HR Executive · Human Resources (Bengaluru HQ)',
                source: 'Zoho People (Employee Form)',
                classification: 'Fact',
              },
              {
                label: 'Calculated Tenure',
                value: '3 yrs 3 mos (Joined 2023-06-15)',
                source: 'Deterministic MetricsService',
                classification: 'Calculation',
              },
              {
                label: 'FY25–26 Appraisal Rating',
                value: '4.6 / 5.0 (Calibrated)',
                source: 'Zoho People Appraisal Module',
                classification: 'Fact',
              },
              {
                label: 'Attendance & Leave',
                value: '96% Attendance · 33% Leave Utilization',
                source: 'Calculated from Attendance & Leave Sync',
                classification: 'Calculation',
              },
            ],
            unknownAttributes: [
              'employment.workShift (Unknown — not recorded in Zoho People)',
              'organisation.secondaryManagerName (Unknown — null in source)',
              'career.aspirations (Unknown — not submitted)',
            ],
          },
        },
      ],
    },
  ],
  DEMO002: [
    {
      id: 'conv_demo002_main',
      employeeId: 'DEMO002',
      title: 'Employee 360 Overview — David Wilson',
      updatedAt: '2026-10-06T09:38:00.000Z',
      messages: [
        {
          id: 'msg_demo002_1',
          role: 'user',
          timestamp: '2026-10-06T09:37:20.000Z',
          employeeId: 'DEMO002',
          content: 'What do we know about David Wilson?',
        },
        {
          id: 'msg_demo002_2',
          role: 'assistant',
          timestamp: '2026-10-06T09:37:25.000Z',
          employeeId: 'DEMO002',
          content:
            'Based on the verified Employee 360 record for **David Wilson (DEMO002)**, he is an **Active** Full-Time Permanent **Software Engineer** in the **Engineering** department (Platform & Integrations division) at **Chennai Tech Park**, reporting to **Karthick Bala**.\n\n### Verified Facts & Deterministic Calculations\n- **Tenure & Lifecycle:** Joined on `2024-02-01` with a deterministically calculated tenure of **2 yrs 8 mos**; employment confirmed on `2024-08-01`.\n- **Performance & Delivery:** Verified FY 2025–2026 appraisal rating of **4.3 / 5.0** (up from `4.0` in FY24–25). Completed **2 of 3** engineering goals, with 1 goal in progress at `80%`.\n- **Attendance & Leave:** Calculated attendance is **94%** (`124` present days out of `132` working days) and leave utilization is **27%** (`8` days taken, `1` request pending approval).\n- **Technical Skills & Certifications:** Verified skills in `Node.js 22`, `TypeScript`, `React 19`, `Zoho Catalyst Serverless`, and `REST API Design`, plus an **AWS Certified Developer – Associate** certification.\n\n### Unrecorded / Unknown Attributes\n- Promotion History (`career.promotions`: **No records / None**)\n- Secondary Reporting Manager (`organisation.secondaryManagerName`: **Unknown**)\n- Career Aspirations (`career.aspirations`: **Unknown**)',
          responseMeta: {
            type: 'Fact',
            confidence: 'high',
            evidence: [
              'employee.email',
              'employment.dateOfJoining',
              'employment.tenure',
              'performance.overallRating',
            ],
            limitations: MOCK_EMPLOYEE_360_MAP.DEMO002.limitations,
            knownFactsSummary: [
              {
                label: 'Role & Location',
                value: 'Software Engineer · Engineering (Chennai Tech Park)',
                source: 'Zoho People (Employee Form)',
                classification: 'Fact',
              },
              {
                label: 'Calculated Tenure',
                value: '2 yrs 8 mos (Joined 2024-02-01)',
                source: 'Deterministic MetricsService',
                classification: 'Calculation',
              },
              {
                label: 'FY25–26 Appraisal Rating',
                value: '4.3 / 5.0 (Up from 4.0)',
                source: 'Zoho People Appraisal Module',
                classification: 'Fact',
              },
            ],
            unknownAttributes: [
              'organisation.secondaryManagerName (Unknown — null in source)',
              'career.aspirations (Unknown — not recorded)',
            ],
          },
        },
      ],
    },
  ],
  DEMO003: [
    {
      id: 'conv_demo003_main',
      employeeId: 'DEMO003',
      title: 'Employee 360 Overview — Priya Sharma',
      updatedAt: '2026-10-06T09:35:00.000Z',
      messages: [
        {
          id: 'msg_demo003_1',
          role: 'user',
          timestamp: '2026-10-06T09:34:10.000Z',
          employeeId: 'DEMO003',
          content: 'What do we know about Priya Sharma?',
        },
        {
          id: 'msg_demo003_2',
          role: 'assistant',
          timestamp: '2026-10-06T09:34:15.000Z',
          employeeId: 'DEMO003',
          content:
            'Based on the verified Employee 360 record for **Priya Sharma (DEMO003)**, she is an **Active** **Business Analyst** in the **Operations** department (Business Process Excellence division) at the **Mumbai Office**, reporting to **Meera Nair**.\n\n### Verified Facts & Deterministic Calculations\n- **Tenure & Joining:** Joined on `2024-12-01`, yielding a deterministically calculated tenure of **1 yr 10 mos**.\n- **Goals & Learning:** Completed **1 of 2** operational goals (*Order-to-Cash SLA bottleneck mapping*) with 1 goal in progress (`55%`). Holds verified skills in `SQL Reporting`, `BPMN 2.0 Process Mapping`, and `Requirements Elicitation`, with 1 completed course and 1 enrolled course (*Lean Six Sigma Green Belt Foundations*).\n\n### Unrecorded / Unknown Attributes (No Fabrication Guardrail)\nSeveral upstream Zoho People modules have no recorded entries for `DEMO003`. In strict compliance with Employee 360 semantics, these values are reported as **Unknown**:\n- **Attendance Percentage:** `Unknown` (No shift logs synced)\n- **Leave Utilization:** `Unknown` (No leave balance rows returned)\n- **Appraisal Rating:** `Unknown` (Review cycle unrecorded)\n- **Confirmation Date & Work Phone:** `Unknown` (`null` in source form)',
          responseMeta: {
            type: 'Fact',
            confidence: 'high',
            evidence: ['employee.email', 'employment.dateOfJoining', 'employment.tenure'],
            limitations: MOCK_EMPLOYEE_360_MAP.DEMO003.limitations,
            knownFactsSummary: [
              {
                label: 'Role & Department',
                value: 'Business Analyst · Operations (Mumbai Office)',
                source: 'Zoho People (Employee Form)',
                classification: 'Fact',
              },
              {
                label: 'Calculated Tenure',
                value: '1 yr 10 mos (Joined 2024-12-01)',
                source: 'Deterministic MetricsService',
                classification: 'Calculation',
              },
            ],
            unknownAttributes: [
              'attendance.attendancePercentage (Unknown — no shift logs)',
              'leave.leaveUtilization (Unknown — leave balances null)',
              'performance.overallRating (Unknown — review cycle unrecorded)',
              'employment.confirmationDate (Unknown — null in Zoho People)',
            ],
          },
        },
      ],
    },
  ],
};

/**
 * Generates a grounded mock AI answer strictly from the employee's canonical Employee 360 record.
 * Used ONLY when `dataSourceMode === 'mock'`.
 */
export function generateMockAskResponse(
  employeeId: string,
  question: string
): AskAIResponse {
  const canonical = MOCK_EMPLOYEE_360_MAP[employeeId];
  const cleanQ = question.trim();
  const qLower = cleanQ.toLowerCase();

  if (!canonical) {
    return {
      answer: `Cannot answer "${cleanQ}": No Employee 360 record was found for employee ID "${employeeId}".`,
      type: 'Unknown',
      confidence: 'high',
      evidence: [],
      limitations: [`No record found for employee ID "${employeeId}".`],
    };
  }

  const name = canonical.employee.fullName || employeeId;
  const evidenceRefs = canonical.evidence.map((e) => `${e.domain}.${e.field}`);

  if (qLower.includes('summarize') || qLower.includes('summary')) {
    const summaryObj = MOCK_SUMMARIES_MAP[employeeId];
    return {
      answer: summaryObj
        ? summaryObj.summary
        : `${name} (${employeeId}) is recorded as ${canonical.employment.jobTitle || 'Unknown Role'} in ${canonical.organisation.department || 'Unknown Department'}.`,
      type: 'AI Insight',
      confidence: 'high',
      evidence: evidenceRefs,
      limitations: canonical.limitations,
    };
  }

  if (qLower.includes('performance') || qLower.includes('trend') || qLower.includes('rating') || qLower.includes('appraisal')) {
    if (canonical.performance.overallRating === null) {
      return {
        answer: `**Performance & Appraisal Status for ${name} (${employeeId}): Unknown**\n\nNo appraisal rating or historical review cycle is recorded in Zoho People for ${name} (\`performance.overallRating\` is \`null\`).\n\nHowever, goal tracking shows **${canonical.goals.completedGoals ?? 0} completed** and **${canonical.goals.inProgressGoals ?? 0} in-progress** goals (${canonical.goals.items.map((g) => `*${g.title}* — ${g.status}`).join('; ')}).\n\nIn accordance with Employee 360 guardrails, performance trends cannot be inferred without verified source ratings.`,
        type: 'Unknown',
        confidence: 'high',
        evidence: ['employment.dateOfJoining', 'employment.tenure'],
        limitations: canonical.limitations,
      };
    }

    const historyText = canonical.performance.historicalRatings
      .map((h) => `- **${h.period}:** \`${h.rating} / 5.0\` (Reviewer: ${h.reviewer || 'Unknown'})`)
      .join('\n');

    return {
      answer: `**Performance Trends & Review Record for ${name} (${employeeId})**\n\n- **Current Appraisal Rating (${canonical.performance.currentReviewPeriod}):** **${canonical.performance.overallRating} / 5.0** (${canonical.performance.reviewStatus || 'Verified'})\n- **Multi-Cycle Trajectory:**\n${historyText}\n- **Documented Strengths:** ${canonical.performance.strengths.join('; ') || 'None recorded'}\n- **Development Areas:** ${canonical.performance.developmentAreas.join('; ') || 'None recorded'}\n- **Goal Execution:** Completed **${canonical.goals.completedGoals} of ${canonical.goals.totalGoals}** assigned goals.`,
      type: canonical.trends && canonical.trends.length > 0 ? 'Trend' : 'Fact',
      confidence: 'high',
      evidence: evidenceRefs.filter((r) => r.startsWith('performance.') || r.startsWith('employment.')),
      limitations: canonical.limitations,
    };
  }

  if (qLower.includes('skill') || qLower.includes('learn') || qLower.includes('course') || qLower.includes('certif')) {
    const tech = canonical.skills.technical.length > 0 ? canonical.skills.technical.join(', ') : 'Unknown / None recorded';
    const comp = canonical.skills.competencies.length > 0 ? canonical.skills.competencies.join(', ') : 'Unknown / None recorded';
    const gaps = canonical.skills.skillGaps.length > 0 ? canonical.skills.skillGaps.join(', ') : 'None recorded';
    const completed = canonical.learning.completedCourses
      .map((c) => (typeof c === 'string' ? c : `${c.title} (${c.completedDate || 'Completed'})`))
      .join('; ');
    const enrolled = canonical.learning.enrolledCourses
      .map((c) => (typeof c === 'string' ? c : `${c.title} (${c.progress ?? 0}% progress)`))
      .join('; ');
    const certs = canonical.learning.certifications
      .map((c) => (typeof c === 'string' ? c : `${c.name} — ${c.issuer || ''}`))
      .join('; ');

    return {
      answer: `**Skills & Learning Profile for ${name} (${employeeId})**\n\n- **Technical Skills:** ${tech}\n- **Core Competencies:** ${comp}\n- **Identified Skill Gaps:** ${gaps}\n- **Completed Courses (${canonical.learning.completedCourses.length}):** ${completed || 'None recorded'}\n- **Currently Enrolled (${canonical.learning.enrolledCourses.length}):** ${enrolled || 'None recorded'}\n- **Certifications (${canonical.learning.certifications.length}):** ${certs || 'None recorded'}`,
      type: 'Fact',
      confidence: 'high',
      evidence: evidenceRefs,
      limitations: canonical.limitations,
    };
  }

  if (qLower.includes('attendance') || qLower.includes('leave') || qLower.includes('shift') || qLower.includes('absent')) {
    const attMetric = canonical.deterministicMetrics.attendancePercentage?.formatted || 'Unknown';
    const leaveMetric = canonical.deterministicMetrics.leaveUtilization?.formatted || 'Unknown';

    if (attMetric === 'Unknown' && leaveMetric === 'Unknown') {
      return {
        answer: `**Attendance & Leave Information for ${name} (${employeeId}): Unknown**\n\nNeither attendance summary logs nor leave balance rows are populated in the Zoho People source record for \`${employeeId}\`. Both **Attendance Percentage** and **Leave Utilization** remain strictly **Unknown**.`,
        type: 'Unknown',
        confidence: 'high',
        evidence: ['employment.dateOfJoining'],
        limitations: canonical.limitations,
      };
    }

    const leaveBreakdown = canonical.leave.balance
      .map((b) => `${b.type}: ${b.taken ?? 0}/${b.entitled ?? 0} taken (${b.balance ?? 0} remaining)`)
      .join(' · ');

    return {
      answer: `**Attendance & Leave Summary for ${name} (${employeeId})**\n\n- **Attendance Rate (${canonical.attendance.summaryPeriod || 'Current Period'}):** **${attMetric}** (\`${canonical.attendance.presentDays}\` present / \`${canonical.attendance.totalWorkingDays}\` working days; \`${canonical.attendance.absentDays}\` absent; \`${canonical.attendance.lateDays}\` late)\n- **Work Shift:** ${canonical.employment.workShift || '**Unknown** (not recorded in Zoho People)'}\n- **Leave Utilization:** **${leaveMetric}** (\`${canonical.leave.takenThisYear ?? 0}\` total days taken this year; \`${canonical.leave.pendingApprovals ?? 0}\` pending approvals)\n- **Balance Breakdown:** ${leaveBreakdown || 'Unknown'}`,
      type: 'Calculation',
      confidence: 'high',
      evidence: evidenceRefs,
      limitations: canonical.limitations,
    };
  }

  if (qLower.includes('unknown') || qLower.includes('missing') || qLower.includes('limitation')) {
    return {
      answer: `**Explicitly Unknown / Unrecorded Attributes for ${name} (${employeeId})**\n\nIn accordance with the **No Hallucination** and **Evidence First** principles, the following attributes are \`null\` or absent in Zoho People and are never fabricated:\n\n${canonical.limitations.map((l) => `- ${l}`).join('\n')}`,
      type: 'Unknown',
      confidence: 'high',
      evidence: evidenceRefs,
      limitations: canonical.limitations,
    };
  }

  // Short conversational openers ("hello", "hi there", "good morning", "thanks") get a brief,
  // presentation-friendly reply instead of the full intelligence brief below.
  const wordCount = qLower.split(/\s+/).filter(Boolean).length;
  const isGreeting =
    wordCount <= 4 &&
    /^(hi+|hello+|hey+|hola|namaste|greetings|good\s+(morning|afternoon|evening))\b/.test(qLower);
  const isThanks = wordCount <= 4 && /^(thanks|thank\s+you|thx|ty)\b/.test(qLower);

  if (isGreeting) {
    return {
      answer: `**Hello! I'm the Employee 360 AI assistant.**\n\nI'm currently grounded on **${name}** (\`${employeeId}\`) — ${canonical.employment.jobTitle || 'Role Unknown'}, ${canonical.organisation.department || 'Department Unknown'}. Every answer is drawn only from verified Zoho People records and deterministic calculations; anything not recorded is reported as **Unknown**.\n\nYou can ask me about:\n- **Overview** — "What do we know about this employee?"\n- **Performance** — appraisal ratings and multi-year trends\n- **Skills & Learning** — competencies, courses and certifications\n- **Attendance & Leave** — attendance rate and leave utilization\n- **Data Gaps** — which attributes are Unknown or unrecorded`,
      type: 'Fact',
      confidence: 'high',
      evidence: evidenceRefs.filter((r) => r.startsWith('employee.') || r.startsWith('employment.')),
      limitations: [],
    };
  }

  if (isThanks) {
    return {
      answer: `You're welcome! Ask anything else about **${name}** (\`${employeeId}\`) whenever you're ready.`,
      type: 'Fact',
      confidence: 'high',
      evidence: [],
      limitations: [],
    };
  }

  // Default comprehensive answer ("What do we know about this employee?" / "What should I know about this employee?" / general query)
  const tenureStr = canonical.deterministicMetrics.tenure?.formatted || 'Unknown';
  const attStr = canonical.deterministicMetrics.attendancePercentage?.formatted || 'Unknown';
  const leaveStr = canonical.deterministicMetrics.leaveUtilization?.formatted || 'Unknown';
  const perfStr =
    canonical.performance.overallRating !== null
      ? `${canonical.performance.overallRating} / 5.0`
      : 'Unknown';

  return {
    answer: `**Employee 360 Intelligence Brief for ${name} (${employeeId})**\n\n- **Identity & Role:** ${canonical.employment.jobTitle || 'Unknown'} in **${canonical.organisation.department || 'Unknown'}** (${canonical.organisation.division || 'Division Unknown'}), based at **${canonical.employment.workLocation || 'Unknown'}**. Status: **${canonical.employment.employmentStatus || 'Unknown'}**.\n- **Reporting Line:** Reports to **${canonical.organisation.reportingManagerName || 'Unknown'}** (${canonical.organisation.reportingManagerEmail || 'No email'}).\n- **Calculated Tenure:** **${tenureStr}** (Date of Joining: \`${canonical.employment.dateOfJoining || 'Unknown'}\`; Confirmation Date: \`${canonical.employment.confirmationDate || 'Unknown'}\`).\n- **Deterministic Metrics:** Attendance: **${attStr}** · Leave Utilization: **${leaveStr}** · Appraisal Rating: **${perfStr}**.\n- **Goals & Learning:** **${canonical.goals.completedGoals ?? 0}/${canonical.goals.totalGoals ?? 0}** goals completed; **${canonical.learning.completedCourses.length}** courses completed; **${canonical.learning.certifications.length}** certifications verified.\n- **Known Source Limitations:** ${canonical.limitations.join(' ')}`,
    type: 'Fact',
    confidence: 'high',
    evidence: evidenceRefs,
    limitations: canonical.limitations,
  };
}

export const employee360MockService = {
  async getZohoStatus(): Promise<ZohoConnectionStatus> {
    return MOCK_ZOHO_STATUS;
  },

  async getEmployeeDirectory(): Promise<EmployeeDirectoryResponse> {
    return {
      employees: MOCK_EMPLOYEES_DIRECTORY,
      total: MOCK_EMPLOYEES_DIRECTORY.length,
      connected: true,
      connectionName: MOCK_ZOHO_STATUS.connectionName,
      source: 'demo_mock_dataset',
    };
  },

  async getEmployee360(employeeId: string): Promise<Employee360Data> {
    const cleanId = employeeId.trim().toUpperCase();
    const match = MOCK_EMPLOYEE_360_MAP[cleanId] || MOCK_EMPLOYEE_360_MAP[employeeId.trim()];
    if (match) {
      return match;
    }

    // If an unknown ID is queried in mock mode, return the canonical default with Unknown semantics
    return {
      metadata: {
        employeeId: cleanId,
        sourceRecordId: null,
        schemaVersion: '1.0.0',
        builtAt: new Date().toISOString(),
        tenantId: 'vsk_hr_solution',
      },
      isLiveZohoData: false,
      liveSyncStatus: 'NOT_FOUND_IN_DEMO',
      employee: {
        employeeId: cleanId,
        firstName: null,
        lastName: null,
        fullName: null,
        email: null,
        phone: null,
        avatarUrl: null,
      },
      employment: {
        jobTitle: null,
        employeeType: null,
        employmentStatus: null,
        dateOfJoining: null,
        confirmationDate: null,
        workLocation: null,
        workShift: null,
        probationStatus: null,
      },
      organisation: {
        department: null,
        division: null,
        reportingManagerId: null,
        reportingManagerName: null,
        reportingManagerEmail: null,
        secondaryManagerName: null,
      },
      attendance: {
        summaryPeriod: null,
        totalWorkingDays: null,
        presentDays: null,
        absentDays: null,
        lateDays: null,
        attendancePercentage: null,
        recentPunches: [],
      },
      leave: {
        balance: [],
        takenThisYear: null,
        pendingApprovals: null,
        recentRequests: [],
      },
      performance: {
        currentReviewPeriod: null,
        overallRating: null,
        historicalRatings: [],
        strengths: [],
        developmentAreas: [],
        reviewStatus: null,
      },
      goals: {
        totalGoals: null,
        completedGoals: null,
        inProgressGoals: null,
        items: [],
      },
      skills: {
        technical: [],
        competencies: [],
        skillGaps: [],
      },
      learning: {
        enrolledCourses: [],
        completedCourses: [],
        certifications: [],
      },
      career: {
        promotions: [],
        roleChanges: [],
        aspirations: null,
      },
      lifecycle: {
        onboardingCompleted: null,
        currentStage: null,
        exitInitiated: null,
        exitDate: null,
      },
      deterministicMetrics: {
        tenure: { formatted: 'Unknown', classification: 'Unknown' },
        attendancePercentage: { value: null, formatted: 'Unknown', classification: 'Unknown' },
        leaveUtilization: { value: null, formatted: 'Unknown', classification: 'Unknown' },
        performanceRating: { value: null, formatted: 'Unknown', classification: 'Unknown' },
      },
      trends: [],
      timeline: [],
      evidence: [],
      limitations: [
        `No employee record found in the demo dataset for ID "${cleanId}". Select DEMO001, DEMO002, or DEMO003, or switch to Live API Mode to query your Zoho People portal.`,
      ],
    };
  },

  async getEmployeeSummary(employeeId: string): Promise<EmployeeSummaryResponse> {
    const cleanId = employeeId.trim().toUpperCase();
    const summary = MOCK_SUMMARIES_MAP[cleanId];
    if (summary) return summary;
    return {
      employeeId: cleanId,
      summary: `No employee record was found in the demo dataset for ID "${cleanId}". Please select DEMO001 (Sarah Anderson), DEMO002 (David Wilson), or DEMO003 (Priya Sharma), or switch to Live API mode.`,
      isAiGenerated: false,
      model: null,
      evidenceCount: 0,
      limitations: [`No demo record found for "${cleanId}".`],
    };
  },

  async getEmployeeInsights(employeeId: string): Promise<EmployeeInsightsResponse> {
    const cleanId = employeeId.trim().toUpperCase();
    const insights = MOCK_INSIGHTS_MAP[cleanId];
    if (insights) return insights;
    return {
      employeeId: cleanId,
      insights: [],
      metricsSnapshot: {},
      limitations: [`No demo record found for "${cleanId}".`],
    };
  },

  async getEmployeeTimeline(employeeId: string): Promise<EmployeeTimelineResponse> {
    const cleanId = employeeId.trim().toUpperCase();
    const canonical = MOCK_EMPLOYEE_360_MAP[cleanId];
    const events = canonical?.timeline || [];
    return {
      employeeId: cleanId,
      events,
      totalEvents: events.length,
    };
  },

  // The mock answers each question on its own; conversation history is ignored.
  async askEmployeeAI(employeeId: string, question: string): Promise<AskAIResponse> {
    const cleanId = employeeId.trim().toUpperCase();
    return generateMockAskResponse(cleanId, question);
  },

  /** Demo version of POST /v1/ask: the signed-in demo user is DEMO001. */
  async askChat(
    question: string,
    // Same signature as the live API; the demo answers ignore conversation history.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _history: unknown[] = [],
    mentions: { employeeIds: string[]; departments: string[]; all: boolean } = {
      employeeIds: [],
      departments: [],
      all: false,
    }
  ): Promise<AskAIResponse> {
    const plain = question.replace(/(^|\s)[@#](?=\S)/g, '$1').trim();
    if (mentions.employeeIds.length === 1 && !mentions.all && mentions.departments.length === 0) {
      const target = MOCK_EMPLOYEES_DIRECTORY.find((e) => e.employeeId === mentions.employeeIds[0]);
      return {
        ...generateMockAskResponse(mentions.employeeIds[0], plain),
        scope: { label: target?.fullName || mentions.employeeIds[0], memberCount: 1 },
      };
    }
    const groupQuestion =
      mentions.all ||
      mentions.departments.length > 0 ||
      mentions.employeeIds.length > 1 ||
      /\b(how many|headcount|employees|users|people|staff|team|department|list|who)\b/i.test(plain);
    if (!groupQuestion) {
      return { ...generateMockAskResponse('DEMO001', plain), scope: { label: 'Sarah Anderson', memberCount: 1 } };
    }
    const departments = new Set(mentions.departments.map((d) => d.toLowerCase()));
    const ids = new Set(mentions.employeeIds);
    const members =
      departments.size > 0 || ids.size > 0
        ? MOCK_EMPLOYEES_DIRECTORY.filter(
            (e) => ids.has(e.employeeId) || departments.has((e.department || '').toLowerCase())
          )
        : MOCK_EMPLOYEES_DIRECTORY;
    // Same wording as the live backend (AccessScope.label)
    const label =
      ids.size > 0
        ? 'the selected employees'
        : mentions.departments.length > 0
          ? mentions.departments.join(' and ')
          : 'the demo organization';
    const active = members.filter((e) => (e.status || '').toLowerCase() === 'active');
    const lines = members.map(
      (e) => `- **${e.fullName} (${e.employeeId})** · ${e.department || 'Department not recorded'} · ${e.status || 'Unknown'}`
    );
    return {
      answer: [`**${members.length} employees** in ${label} (**${active.length} active**):`, ...lines].join('\n'),
      type: 'Fact',
      confidence: 'high',
      evidence: ['directory.employmentStatus', 'directory.department'],
      limitations: ['Demo dataset: answers come from the frontend demo records, not Zoho People.'],
      route: 'group',
      scope: { label, memberCount: members.length },
    };
  },
};
