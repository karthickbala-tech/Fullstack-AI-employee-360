/**
 * AI Employee 360 — Canonical TypeScript Models
 * Derived strictly from the verified backend source code and FRONTEND_API_CONTRACT.md.
 */

export type DataClassification =
  | 'Fact'
  | 'Calculation'
  | 'Trend'
  | 'Correlation'
  | 'AI Insight'
  | 'Unknown';

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown';

export type DataSourceMode = 'mock' | 'live';

export type ActivePage = 'ai' | 'dashboard';

export type DashboardSectionId =
  | 'overview'
  | 'summary'
  | 'timeline'
  | 'performance'
  | 'learning'
  | 'attendance'
  | 'evidence';

export interface ApiResponseEnvelope<T> {
  success: boolean;
  data: T;
  meta?: {
    timestamp: string;
    employeeId?: string;
    question?: string;
    [key: string]: unknown;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface ZohoConnectionStatus {
  connected: boolean;
  connectionName: string;
  dataCenter: string;
  portalId: string;
  organizationName: string;
  activeRecordsCount?: number;
  message: string;
}

export interface EmployeeDirectoryEntry {
  recordId: string | null;
  employeeId: string;
  fullName: string | null;
  jobTitle: string | null;
  department: string | null;
  email: string | null;
  workLocation: string | null;
  status: string | null;
}

/**
 * GET /v1/me: the caller's identity and scope as decided by the backend.
 * With backend authentication off it reports authenticationEnabled: false and
 * no user; the extra fields are present only when authentication is on.
 */
export interface AccessProfile {
  authenticationEnabled: boolean;
  role: string;
  scope: string;
  employeeId: string | null;
  allowedEmployeeIds: string[] | null;
  userId?: string;
  email?: string | null;
  identitySource?: 'catalyst' | 'zoho_people' | null;
  authenticated?: boolean;
  employeeMapping?: 'matched' | 'not_found' | 'ambiguous' | 'no_email' | null;
  displayName?: string | null;
  allowedEmployees?: { employeeId: string; fullName: string | null }[] | null;
  canAnalyzeTeam?: boolean;
  canAnalyzeOrganization?: boolean;
}

export interface EmployeeDirectoryResponse {
  employees: EmployeeDirectoryEntry[];
  total: number;
  connected: boolean;
  connectionName: string;
  source: string;
}

export interface EvidenceRecord {
  domain: string;
  field: string;
  source: string;
  classification: DataClassification;
  sourceRecordId: string | null;
  sourceTimestamp: string;
  confidence: ConfidenceLevel;
  notes: string | null;
  value?: unknown;
}

export interface TimelineEvent {
  id: string;
  eventCode: string;
  type: string;
  title: string;
  date: string;
  description: string | null;
  domain: string;
  source: string;
  sourceRecordId: string | null;
}

export interface DeterministicMetricItem {
  value?: number | string | null;
  years?: number;
  months?: number;
  totalMonths?: number;
  formatted?: string;
  classification: DataClassification;
}

export interface DeterministicMetrics {
  tenure?: DeterministicMetricItem;
  attendancePercentage?: DeterministicMetricItem;
  leaveUtilization?: DeterministicMetricItem;
  performanceRating?: DeterministicMetricItem;
  [key: string]: DeterministicMetricItem | undefined;
}

export interface TrendItem {
  domain: string;
  metric: string;
  direction?: string;
  evidence: string;
}

export interface LeaveBalanceItem {
  type: string | null;
  entitled: number | null;
  taken: number | null;
  balance: number | null;
}

export interface LeaveRequestItem {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
}

export interface AttendancePunchItem {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
}

export interface HistoricalRatingItem {
  period: string;
  rating: number | string;
  reviewer?: string | null;
}

export interface GoalItem {
  id?: string;
  title: string;
  status: string;
  progress?: number | null;
  dueDate?: string | null;
}

export interface CourseItem {
  title: string;
  provider?: string | null;
  status?: string | null;
  completedDate?: string | null;
  progress?: number | null;
}

export interface CertificationItem {
  name: string;
  issuer?: string | null;
  issuedDate?: string | null;
}

export interface PromotionItem {
  designation: string;
  effectiveDate: string;
  notes?: string | null;
  sourceRecordId?: string | null;
}

export interface RoleChangeItem {
  fromRole?: string | null;
  toRole: string;
  effectiveDate: string;
  department?: string | null;
}

export interface Employee360Data {
  metadata: {
    employeeId: string;
    sourceRecordId: string | null;
    schemaVersion: string;
    builtAt: string;
    tenantId: string;
  };
  isLiveZohoData?: boolean;
  liveSyncStatus?: string;
  employee: {
    employeeId: string;
    firstName: string | null;
    lastName: string | null;
    fullName: string | null;
    email: string | null;
    phone: string | null;
    avatarUrl: string | null;
  };
  employment: {
    jobTitle: string | null;
    employeeType: string | null;
    employmentStatus: string | null;
    dateOfJoining: string | null;
    confirmationDate: string | null;
    workLocation: string | null;
    workShift: string | null;
    probationStatus: string | null;
  };
  organisation: {
    department: string | null;
    division: string | null;
    reportingManagerId: string | null;
    reportingManagerName: string | null;
    reportingManagerEmail: string | null;
    secondaryManagerName: string | null;
  };
  attendance: {
    summaryPeriod: string | null;
    totalWorkingDays: number | null;
    presentDays: number | null;
    absentDays: number | null;
    lateDays: number | null;
    attendancePercentage: number | null;
    recentPunches: AttendancePunchItem[];
  };
  leave: {
    balance: LeaveBalanceItem[];
    takenThisYear: number | null;
    pendingApprovals: number | null;
    recentRequests: LeaveRequestItem[];
  };
  performance: {
    currentReviewPeriod: string | null;
    overallRating: number | string | null;
    historicalRatings: HistoricalRatingItem[];
    strengths: string[];
    developmentAreas: string[];
    reviewStatus: string | null;
  };
  goals: {
    totalGoals: number | null;
    completedGoals: number | null;
    inProgressGoals: number | null;
    items: GoalItem[];
  };
  skills: {
    technical: string[];
    competencies: string[];
    skillGaps: string[];
  };
  learning: {
    enrolledCourses: Array<string | CourseItem>;
    completedCourses: Array<string | CourseItem>;
    certifications: Array<string | CertificationItem>;
  };
  career: {
    promotions: PromotionItem[];
    roleChanges: RoleChangeItem[];
    aspirations: string | null;
  };
  lifecycle: {
    onboardingCompleted: boolean | null;
    currentStage: string | null;
    exitInitiated: boolean | null;
    exitDate: string | null;
  };
  deterministicMetrics: DeterministicMetrics;
  trends?: TrendItem[];
  timeline?: TimelineEvent[];
  evidence: EvidenceRecord[];
  limitations: string[];
}

export interface EmployeeSummaryResponse {
  employeeId: string;
  summary: string;
  isAiGenerated: boolean;
  model: string | null;
  evidenceCount: number;
  limitations: string[];
}

export interface EmployeeInsightItem {
  domain: string;
  type: DataClassification;
  headline: string;
  description: string;
  confidence: ConfidenceLevel;
  evidence: string[];
}

export interface EmployeeInsightsResponse {
  employeeId: string;
  insights: EmployeeInsightItem[];
  metricsSnapshot: DeterministicMetrics;
  limitations: string[];
}

export interface EmployeeTimelineResponse {
  employeeId: string;
  events: TimelineEvent[];
  totalEvents: number;
}

export interface AskHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AskAIRequest {
  question: string;
  history?: AskHistoryTurn[];
}

// How the backend produced an Ask answer (see FRONTEND_API_CONTRACT.md).
export type AskRoute = 'conversation' | 'general' | 'deterministic' | 'organization' | 'employee';

export interface AskAIResponse {
  answer: string;
  type: DataClassification;
  confidence: ConfidenceLevel;
  evidence: string[];
  limitations: string[];
  route?: AskRoute;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  timestamp: string;
  employeeId: string;
  content: string;
  responseMeta?: {
    route?: AskRoute;
    type: DataClassification;
    confidence: ConfidenceLevel;
    evidence: string[];
    limitations: string[];
    knownFactsSummary?: Array<{ label: string; value: string; source: string; classification: DataClassification }>;
    unknownAttributes?: string[];
  };
}

export interface ConversationThread {
  id: string;
  employeeId: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}
