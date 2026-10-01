/**
 * Canonical Employee 360 Types
 * Strictly aligned with functions/employee_360_ai_function/models/employee360Model.js
 * and verified backend API response structures in FRONTEND_API_CONTRACT.md.
 */

export type DataClassification =
  | 'fact'
  | 'calculation'
  | 'trend'
  | 'correlation'
  | 'ai_insight'
  | 'unknown'
  | 'Fact'
  | 'Calculation'
  | 'Trend'
  | 'Correlation'
  | 'AI Insight'
  | 'Unknown';

export type ConfidenceLevel =
  | 'high'
  | 'medium'
  | 'low'
  | 'unknown'
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'UNKNOWN';

export interface EmployeeProfile {
  employeeId: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
}

export interface EmploymentInfo {
  jobTitle: string | null;
  employeeType: string | null;
  employmentStatus: string | null;
  dateOfJoining: string | null;
  confirmationDate: string | null;
  workLocation: string | null;
  workShift: string | null;
  probationStatus: string | null;
}

export interface OrganisationInfo {
  department: string | null;
  division: string | null;
  reportingManagerId: string | null;
  reportingManagerName: string | null;
  reportingManagerEmail: string | null;
  secondaryManagerName: string | null;
}

export interface AttendancePunch {
  date: string;
  checkIn: string;
  checkOut: string;
  status?: string;
}

export interface AttendanceInfo {
  summaryPeriod: string | null;
  totalWorkingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  attendancePercentage: number;
  recentPunches?: AttendancePunch[];
  status?: string;
}

export interface LeaveBalanceItem {
  type?: string;
  Leave_Type?: string;
  name?: string;
  balance?: number;
  Balance_Count?: number;
  taken?: number;
  Taken_Count?: number;
  entitled?: number;
}

export interface LeaveInfo {
  balance: LeaveBalanceItem[];
  takenThisYear: number;
  pendingApprovals: number;
  recentRequests?: Array<{
    type: string;
    from: string;
    to: string;
    status: string;
  }>;
  status?: string;
}

export interface HistoricalRating {
  period?: string;
  cycle?: string;
  rating: number | string;
  reviewer?: string;
  comments?: string;
}

export interface PerformanceInfo {
  currentReviewPeriod: string | null;
  overallRating: string | number | null;
  historicalRatings: HistoricalRating[];
  strengths: string[];
  developmentAreas: string[];
  reviewStatus: string | null;
  status?: string;
}

export interface GoalsInfo {
  totalGoals: number;
  completedGoals: number;
  inProgressGoals: number;
  items: Array<{
    id: string;
    title: string;
    targetDate?: string;
    progress?: number;
    status?: string;
  }>;
  status?: string;
}

export interface SkillsInfo {
  technical: Array<{
    name: string;
    proficiency?: number;
    category?: string;
  }>;
  competencies: Array<{
    name: string;
    proficiency?: number;
  }>;
  skillGaps: Array<{
    skill: string;
    current?: number;
    required?: number;
    gap?: number;
  }>;
}

export interface LearningInfo {
  enrolledCourses: Array<{
    id: string;
    title: string;
    status?: string;
  }>;
  completedCourses: Array<{
    id: string;
    title: string;
    completedDate?: string;
    hours?: number;
  }>;
  certifications: Array<{
    id?: string;
    name: string;
    issuer?: string;
    issueDate?: string;
    expiryDate?: string;
    status?: string;
  }>;
}

export interface CareerPromotion {
  designation?: string;
  title?: string;
  effectiveDate?: string;
  date?: string;
  notes?: string;
  department?: string;
}

export interface CareerInfo {
  promotions: CareerPromotion[];
  roleChanges: any[];
  aspirations: string | null;
}

export interface LifecycleInfo {
  onboardingCompleted: boolean;
  currentStage: string;
  exitInitiated: boolean;
  exitDate: string | null;
}

export interface DeterministicMetrics {
  tenure?: {
    years?: number;
    months?: number;
    days?: number;
    formatted: string;
    classification: DataClassification;
  };
  attendancePercentage?: {
    value: number | null;
    formatted: string;
    classification: DataClassification;
  };
  leaveUtilization?: {
    value: number | null;
    formatted: string;
    classification: DataClassification;
  };
  performanceRating?: {
    value: string | number | null;
    formatted?: string;
    classification: DataClassification;
  };
  [key: string]: any;
}

export interface TrendItem {
  domain: string;
  metric: string;
  trend: string;
  delta?: number;
  classification: DataClassification;
  evidence: string;
}

export interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  date: string;
  description: string;
  domain?: string;
  source?: string;
  category?: string;
}

export interface EvidenceItem {
  id?: string;
  domain?: string;
  field?: string;
  source: string;
  classification: DataClassification;
  sourceRecordId?: string;
  confidence?: string;
  notes?: string;
  value?: any;
  description?: string;
}

export interface Employee360Data {
  metadata: {
    employeeId: string;
    schemaVersion: string;
    builtAt: string;
    tenantId: string;
  };
  employee: EmployeeProfile;
  employment: EmploymentInfo;
  organisation: OrganisationInfo;
  attendance: AttendanceInfo;
  leave: LeaveInfo;
  performance: PerformanceInfo;
  goals: GoalsInfo;
  skills: SkillsInfo;
  learning: LearningInfo;
  career: CareerInfo;
  lifecycle: LifecycleInfo;
  deterministicMetrics: DeterministicMetrics;
  evidence: EvidenceItem[];
  limitations: string[];
  isLiveZohoData: boolean;
  liveSyncStatus: string;
  trends: TrendItem[];
  timeline: TimelineEvent[];
}

export interface EmployeeSummaryResponse {
  employeeId: string;
  summary: string;
  isAiGenerated: boolean;
  model: string | null;
  evidenceCount: number;
  limitations: string[];
}

export interface InsightItem {
  domain: string;
  type: DataClassification;
  headline: string;
  description: string;
  confidence: ConfidenceLevel;
  evidence: string[];
  severity?: string;
  recommendedAction?: string;
  source?: string;
}

export interface EmployeeInsightsResponse {
  employeeId: string;
  insights: InsightItem[];
  metricsSnapshot: DeterministicMetrics;
  limitations: string[];
}

export interface EmployeeTimelineResponse {
  employeeId: string;
  events: TimelineEvent[];
  totalEvents: number;
}

export interface AskAIResponse {
  answer: string;
  type: DataClassification;
  confidence: ConfidenceLevel;
  evidence: string[];
  limitations: string[];
}

export interface ZohoConnectionStatus {
  connected: boolean;
  connectionName: string;
  dataCenter?: string;
  portalId?: string;
  organizationName?: string;
  activeRecordsCount?: number;
  message: string;
  error?: string;
  isAuthError?: boolean;
}

export interface ZohoDirectoryEmployee {
  recordId: string | null;
  employeeId: string;
  fullName: string;
  jobTitle: string | null;
  department: string | null;
  email: string | null;
  workLocation: string | null;
  status: string;
}