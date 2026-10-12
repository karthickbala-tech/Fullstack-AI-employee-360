import React, { useState } from 'react';
import type {
  DashboardSectionId,
  DataSourceMode,
  Employee360Data,
  EmployeeInsightsResponse,
  EmployeeSummaryResponse,
  EmployeeTimelineResponse,
} from '../types/employee360';
import { EmployeeAvatar } from './EmployeeAvatar';
import { ConfidenceLabel, FieldValueDisplay, SemanticBadge } from './SemanticBadge';

interface DashboardViewProps {
  employeeId: string;
  canonical: Employee360Data | null;
  summary: EmployeeSummaryResponse | null;
  insights: EmployeeInsightsResponse | null;
  timeline: EmployeeTimelineResponse | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onAskQuestionFromDashboard: (question: string) => void;
  dataSourceMode: DataSourceMode;
}

const SECTION_ITEMS: Array<{ id: DashboardSectionId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'summary', label: 'Summary & Insights' },
  { id: 'timeline', label: 'Timeline & Lifecycle' },
  { id: 'performance', label: 'Performance & Goals' },
  { id: 'learning', label: 'Skills & Learning' },
  { id: 'attendance', label: 'Attendance & Leave' },
  { id: 'evidence', label: 'Evidence & Limitations' },
];

/** Renders **bold** spans from the summary text; everything else stays plain text. */
function renderBold(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, idx) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={idx}>{part.slice(2, -2)}</strong>
    ) : (
      part
    )
  );
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  employeeId,
  canonical,
  summary,
  insights,
  timeline,
  isLoading,
  error,
  onRetry,
  onAskQuestionFromDashboard,
  dataSourceMode,
}) => {
  const [activeSection, setActiveSection] = useState<DashboardSectionId>('overview');
  // Summary shows its lead paragraph by default; expansion is tracked per employee
  const [summaryExpandedFor, setSummaryExpandedFor] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="dashboard-workspace-shell">
        <aside className="dashboard-sidebar" aria-hidden="true">
          <div>
            {SECTION_ITEMS.map((item) => (
              <div key={item.id} className="dash-nav-skeleton" />
            ))}
          </div>
        </aside>
        <main className="dashboard-main-stage" aria-busy="true">
          <p className="sr-only" role="status">
            Loading Employee 360 record for {employeeId}…
          </p>
          <div className="dash-loading-banner" aria-hidden="true">
            <div className="skeleton-block skeleton-avatar" />
            <div className="skeleton-lines">
              <div className="skeleton-line is-title w-65" />
              <div className="skeleton-line w-45" />
              <div className="skeleton-line w-85" />
            </div>
          </div>
          <div className="metrics-kpi-grid" aria-hidden="true">
            {Array.from({ length: 6 }, (_, idx) => (
              <div key={idx} className="skeleton-block skeleton-kpi" />
            ))}
          </div>
          <div className="dash-loading-card" aria-hidden="true">
            <div className="skeleton-line is-title w-30" />
            <div className="skeleton-line w-92" />
            <div className="skeleton-line w-85" />
            <div className="skeleton-line w-65" />
          </div>
        </main>
      </div>
    );
  }

  if (error || !canonical) {
    return (
      <div className="dashboard-workspace-shell">
        <main className="dashboard-main-stage">
          <div className="dash-error-state" role="alert">
            <h2>Unable to Load Employee 360 Record ({employeeId})</h2>
            <p>{error || 'No canonical Employee 360 payload returned from the backend.'}</p>
            <div className="dash-error-actions">
              <button type="button" className="primary-action-btn" onClick={onRetry}>
                Retry Request
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const emp = canonical.employee;
  const employment = canonical.employment;
  const org = canonical.organisation;
  const metrics = canonical.deterministicMetrics || {};
  const timelineEvents = timeline?.events || canonical.timeline || [];
  const completedLearningCount =
    (canonical.learning?.completedCourses?.length || 0) +
    (canonical.learning?.certifications?.length || 0);
  const enrolledCount = canonical.learning?.enrolledCourses?.length || 0;

  const showSection = (sec: DashboardSectionId) =>
    activeSection === 'overview' || activeSection === sec;

  const summaryParagraphs = (summary?.summary || 'No summary returned from the backend.')
    .split('\n\n')
    .map((para) => para.trim())
    .filter(Boolean);
  const isSummaryExpanded = summaryExpandedFor === employeeId;
  const visibleSummaryParagraphs = isSummaryExpanded
    ? summaryParagraphs
    : summaryParagraphs.slice(0, 1);

  return (
    <div className="dashboard-workspace-shell">
      {/* Left Navigation Sidebar matching Reference Image 2 */}
      <aside className="dashboard-sidebar" aria-label="Employee 360 dashboard sections">
        <nav className="dash-sidebar-nav">
          {SECTION_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`dash-sidebar-link ${activeSection === item.id ? 'active' : ''}`}
              onClick={() => setActiveSection(item.id)}
            >
              {item.label}
            </button>
          ))}

          <button
            type="button"
            className="dash-sidebar-link dash-ask-ai-jump"
            onClick={() =>
              onAskQuestionFromDashboard(
                `Give me an executive briefing on ${emp.fullName || employeeId} (${employeeId}).`
              )
            }
          >
            <span>Ask AI</span>
            <span aria-hidden="true">→</span>
          </button>
        </nav>

        <div className="dash-sidebar-footer">
          <div className="dash-sync-meta">
            <span>Schema v{canonical.metadata.schemaVersion}</span>
            <span aria-hidden="true">·</span>
            <span>{dataSourceMode === 'mock' ? 'Demo Data' : 'Live Sync'}</span>
          </div>
        </div>
      </aside>

      {/* Main Structured Employee 360 Content Area */}
      <main className="dashboard-main-stage">
        {/* Top Employee Profile Header Banner (Reference Image 2 layout) */}
        <section className="emp-profile-banner" aria-label="Employee identity and context">
          <div className="emp-profile-left">
            <EmployeeAvatar
              employeeId={employeeId}
              fullName={emp.fullName}
              avatarUrl={emp.avatarUrl}
              size="lg"
            />
            <div className="emp-identity-block">
              <div className="emp-name-row">
                <h1 className="emp-full-name">
                  {emp.fullName || `Employee ${employeeId}`}
                </h1>
                <span className="emp-id-tag mono-num">{employeeId}</span>
                <span
                  className={`emp-status-tag ${
                    (employment.employmentStatus || '').toLowerCase() === 'active'
                      ? 'status-active'
                      : 'status-inactive'
                  }`}
                >
                  {employment.employmentStatus || 'Unknown Status'}
                </span>
              </div>

              <div className="emp-role-title">
                {employment.jobTitle || 'Job Title Unknown'}
              </div>

              <div className="emp-org-metadata">
                <span>
                  Department: <strong>{org.department || 'Unknown'}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Location: <strong>{employment.workLocation || 'Unknown'}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Manager: <strong>{org.reportingManagerName || 'Unknown'}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="emp-profile-right">
            <div className="subject-context-badge">
              <div className="subject-context-text">
                <span className="subject-context-kicker">SUBJECT CONTEXT</span>
                <span className="subject-context-val">
                  Subject: <strong>{emp.fullName || employeeId}</strong> (
                  <span className="mono-num">{employeeId}</span>)
                </span>
              </div>
              <EmployeeAvatar
                employeeId={employeeId}
                fullName={emp.fullName}
                size="sm"
              />
            </div>

            <div className="header-quick-stats">
              <div className="header-stat-box">
                <span className="header-stat-label">TENURE</span>
                <strong className="header-stat-value mono-num">
                  {metrics.tenure?.formatted || 'Unknown'}
                </strong>
              </div>
              <div className="header-stat-box">
                <span className="header-stat-label">DATE JOINED</span>
                <strong className="header-stat-value mono-num">
                  {employment.dateOfJoining || 'Unknown'}
                </strong>
              </div>
            </div>
          </div>
        </section>

        {/* 6 Deterministic Metric Cards Row (Matching Reference Image 2) */}
        <section className="metrics-kpi-grid" aria-label="Employee 360 deterministic metrics">
          {/* 1. Calculated Tenure */}
          <article className="metric-kpi-card">
            <div className="metric-card-top">
              <span className="metric-card-title">CALCULATED TENURE</span>
            </div>
            <div className="metric-card-value mono-num">
              {metrics.tenure?.formatted || 'Unknown'}
            </div>
            <div className="metric-card-sub">
              Joined: {employment.dateOfJoining || 'Unknown'}
            </div>
            <div className="metric-card-foot">
              <SemanticBadge
                classification={metrics.tenure?.classification || 'Unknown'}
              />
            </div>
          </article>

          {/* 2. Attendance */}
          <article className="metric-kpi-card">
            <div className="metric-card-top">
              <span className="metric-card-title">ATTENDANCE</span>
            </div>
            <div className="metric-card-value mono-num">
              {metrics.attendancePercentage?.formatted || 'Unknown'}
            </div>
            <div className="metric-card-sub">
              {canonical.attendance.presentDays !== null &&
              canonical.attendance.totalWorkingDays !== null
                ? `${canonical.attendance.presentDays} / ${canonical.attendance.totalWorkingDays} working days`
                : 'No shift logs'}
            </div>
            <div className="metric-card-foot">
              <SemanticBadge
                classification={
                  metrics.attendancePercentage?.classification || 'Unknown'
                }
              />
            </div>
          </article>

          {/* 3. Leave Utilization */}
          <article className="metric-kpi-card">
            <div className="metric-card-top">
              <span className="metric-card-title">LEAVE UTILIZATION</span>
            </div>
            <div className="metric-card-value mono-num">
              {metrics.leaveUtilization?.formatted || 'Unknown'}
            </div>
            <div className="metric-card-sub">
              {canonical.leave.takenThisYear !== null
                ? `${canonical.leave.takenThisYear} days taken this year`
                : 'null days taken'}
            </div>
            <div className="metric-card-foot">
              <SemanticBadge
                classification={metrics.leaveUtilization?.classification || 'Unknown'}
              />
            </div>
          </article>

          {/* 4. Appraisal Rating */}
          <article className="metric-kpi-card">
            <div className="metric-card-top">
              <span className="metric-card-title">APPRAISAL RATING</span>
            </div>
            <div className="metric-card-value mono-num">
              {metrics.performanceRating?.value !== null &&
              metrics.performanceRating?.value !== undefined
                ? `${metrics.performanceRating.value} / 5.0`
                : 'Unknown'}
            </div>
            <div className="metric-card-sub">
              {canonical.performance.currentReviewPeriod || 'Review cycle unrecorded'}
            </div>
            <div className="metric-card-foot">
              <SemanticBadge
                classification={
                  metrics.performanceRating?.classification || 'Unknown'
                }
              />
            </div>
          </article>

          {/* 5. Completed Learning */}
          <article className="metric-kpi-card">
            <div className="metric-card-top">
              <span className="metric-card-title">COMPLETED LEARNING</span>
            </div>
            <div className="metric-card-value mono-num">
              {completedLearningCount} {completedLearningCount === 1 ? 'record' : 'records'}
            </div>
            <div className="metric-card-sub">
              {enrolledCount} currently enrolled
            </div>
            <div className="metric-card-foot">
              <SemanticBadge classification="Fact" />
            </div>
          </article>

          {/* 6. Grounded Evidence */}
          <article className="metric-kpi-card">
            <div className="metric-card-top">
              <span className="metric-card-title">GROUNDED EVIDENCE</span>
            </div>
            <div className="metric-card-value mono-num">
              {canonical.evidence.length} Records
            </div>
            <div className="metric-card-sub">Verified source fields</div>
            <div className="metric-card-foot">
              <SemanticBadge classification="Fact" />
            </div>
          </article>
        </section>

        {/* Employee 360 Summary Section (Matching Reference Image 2) */}
        {showSection('summary') && (
          <section
            className={`dash-section-card summary-highlight-card ${
              summary?.isAiGenerated ? 'is-ai-generated' : 'is-deterministic'
            }`}
          >
            <div className="dash-card-header">
              <div className="dash-card-title-group">
                <span className="sparkle-glyph" aria-hidden="true">
                  ✦
                </span>
                <h2>Employee 360 Summary</h2>
              </div>

              <div className="dash-card-meta-group">
                <span
                  className="synthesis-source-label"
                  title={
                    summary?.isAiGenerated
                      ? `AI synthesized by ${summary.model || 'Gemini'}`
                      : 'Deterministic factual summary'
                  }
                >
                  {summary?.isAiGenerated ? 'AI-generated' : 'Factual'}
                </span>
                <span className="summary-facts-count mono-num">
                  {summary?.evidenceCount ?? canonical.evidence.length} grounded facts
                </span>
                <button
                  type="button"
                  className="ask-context-btn"
                  onClick={() =>
                    onAskQuestionFromDashboard(`Summarize ${emp.fullName || employeeId}.`)
                  }
                >
                  Discuss in AI Chat →
                </button>
              </div>
            </div>

            <div className="summary-paragraphs" id={`summary-body-${employeeId}`}>
              {visibleSummaryParagraphs.map((para, idx) => (
                <p key={idx}>{renderBold(para)}</p>
              ))}
            </div>

            {(summaryParagraphs.length > 1 || summary?.isAiGenerated) && (
              <div className="summary-footer">
                {summaryParagraphs.length > 1 ? (
                  <button
                    type="button"
                    className="summary-expand-btn"
                    aria-expanded={isSummaryExpanded}
                    aria-controls={`summary-body-${employeeId}`}
                    onClick={() =>
                      setSummaryExpandedFor(isSummaryExpanded ? null : employeeId)
                    }
                  >
                    {isSummaryExpanded ? 'Show less' : 'Read full summary'}
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                ) : (
                  <span />
                )}

                {summary?.isAiGenerated && (
                  <span className="summary-disclaimer-note">
                    AI-generated · may be inaccurate · missing data stays Unknown
                  </span>
                )}
              </div>
            )}
          </section>
        )}

        {/* Deterministic & AI Insights Section */}
        {showSection('summary') && insights && (
          <section className="dash-section-card">
            <div className="dash-card-header">
              <h2>Employee 360 Insights (/v1/employees/{employeeId}/insights)</h2>
              <span className="mono-num">{insights.insights.length} insights</span>
            </div>

            {insights.insights.length > 0 ? (
              <div className="insights-list-grid">
                {insights.insights.map((item, idx) => (
                  <article
                    key={idx}
                    className={`insight-row-item insight-type-${(item.type || 'Unknown')
                      .toLowerCase()
                      .replace(/\s+/g, '-')}`}
                  >
                    <div className="insight-row-top">
                      <div>
                        <span className="insight-domain-label">{item.domain}</span>
                        <h3>{item.headline}</h3>
                      </div>
                      <div className="insight-row-badges">
                        <SemanticBadge classification={item.type} />
                        <ConfidenceLabel confidence={item.confidence} />
                      </div>
                    </div>
                    <p className="insight-row-desc">{item.description}</p>
                    <div className="insight-row-evidence mono-num">
                      Evidence: {item.evidence.join(', ') || 'None'}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-domain-notice">
                No deterministic or AI insights generated for this employee record.
              </div>
            )}
          </section>
        )}

        {/* Basic, Employment, Organisation & Lifecycle Information */}
        {showSection('overview') && (
          <div className="dash-two-col-grid">
            <section className="dash-section-card">
              <div className="dash-card-header">
                <h2>Employee Basic &amp; Organisation Profile</h2>
                <SemanticBadge classification="Fact" />
              </div>
              <dl className="kv-definition-grid">
                <div className="kv-row">
                  <dt>Employee ID</dt>
                  <dd>
                    <FieldValueDisplay value={emp.employeeId} mono />
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Full Name</dt>
                  <dd>
                    <FieldValueDisplay value={emp.fullName} />
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Work Email</dt>
                  <dd>
                    <FieldValueDisplay value={emp.email} mono />
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Work Phone</dt>
                  <dd>
                    <FieldValueDisplay value={emp.phone} mono />
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Department</dt>
                  <dd>
                    <FieldValueDisplay value={org.department} />
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Division</dt>
                  <dd>
                    <FieldValueDisplay value={org.division} />
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Reporting Manager</dt>
                  <dd>
                    <FieldValueDisplay value={org.reportingManagerName} />
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Secondary Manager</dt>
                  <dd>
                    <FieldValueDisplay value={org.secondaryManagerName} />
                  </dd>
                </div>
              </dl>
            </section>

            <section className="dash-section-card">
              <div className="dash-card-header">
                <h2>Employment &amp; Lifecycle Details</h2>
                <SemanticBadge classification="Fact" />
              </div>
              <dl className="kv-definition-grid">
                <div className="kv-row">
                  <dt>Designation / Job Title</dt>
                  <dd>
                    <FieldValueDisplay value={employment.jobTitle} />
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Employment Type</dt>
                  <dd>
                    <FieldValueDisplay value={employment.employeeType} />
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Employment Status</dt>
                  <dd>
                    <FieldValueDisplay value={employment.employmentStatus} />
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Date of Joining</dt>
                  <dd>
                    <FieldValueDisplay value={employment.dateOfJoining} mono />
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Confirmation Date</dt>
                  <dd>
                    <FieldValueDisplay value={employment.confirmationDate} mono />
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Work Location</dt>
                  <dd>
                    <FieldValueDisplay value={employment.workLocation} />
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Work Shift</dt>
                  <dd>
                    <FieldValueDisplay value={employment.workShift} />
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Exit Initiated</dt>
                  <dd>
                    <FieldValueDisplay value={canonical.lifecycle.exitInitiated} />
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        )}

        {/* Performance & Goals Section */}
        {showSection('performance') && (
          <div className="dash-two-col-grid">
            <section className="dash-section-card">
              <div className="dash-card-header">
                <h2>Performance &amp; Appraisal History</h2>
                <SemanticBadge
                  classification={
                    canonical.performance.overallRating !== null ? 'Fact' : 'Unknown'
                  }
                />
              </div>

              <dl className="kv-definition-grid">
                <div className="kv-row">
                  <dt>Current Review Cycle</dt>
                  <dd>
                    <FieldValueDisplay value={canonical.performance.currentReviewPeriod} />
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Overall Rating</dt>
                  <dd>
                    <FieldValueDisplay
                      value={
                        canonical.performance.overallRating !== null
                          ? `${canonical.performance.overallRating} / 5.0`
                          : null
                      }
                      mono
                    />
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Review Status</dt>
                  <dd>
                    <FieldValueDisplay value={canonical.performance.reviewStatus} />
                  </dd>
                </div>
              </dl>

              {canonical.performance.historicalRatings.length > 0 ? (
                <div className="sub-table-block">
                  <h3>Historical Ratings</h3>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Review Period</th>
                        <th>Reviewer</th>
                        <th className="num-col">Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {canonical.performance.historicalRatings.map((row, idx) => (
                        <tr key={idx}>
                          <td className="mono-num">{row.period}</td>
                          <td>{row.reviewer || 'Unknown'}</td>
                          <td className="num-col mono-num">{row.rating} / 5.0</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-domain-notice">
                  No historical appraisal ratings available in Zoho People.
                </div>
              )}

              <div className="sub-list-block">
                <h3>Evidenced Strengths</h3>
                {canonical.performance.strengths.length > 0 ? (
                  <ul className="clean-bullet-list">
                    {canonical.performance.strengths.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                ) : (
                  <FieldValueDisplay value={null} unknownLabel="No strengths recorded (Unknown)" />
                )}
              </div>

              <div className="sub-list-block">
                <h3>Development Areas</h3>
                {canonical.performance.developmentAreas.length > 0 ? (
                  <ul className="clean-bullet-list">
                    {canonical.performance.developmentAreas.map((d, idx) => (
                      <li key={idx}>{d}</li>
                    ))}
                  </ul>
                ) : (
                  <FieldValueDisplay
                    value={null}
                    unknownLabel="No development areas recorded (Unknown)"
                  />
                )}
              </div>
            </section>

            <section className="dash-section-card">
              <div className="dash-card-header">
                <h2>Goals &amp; Objectives</h2>
                <span className="mono-num">
                  {canonical.goals.completedGoals ?? 0} / {canonical.goals.totalGoals ?? 0}{' '}
                  Completed
                </span>
              </div>

              {canonical.goals.items.length > 0 ? (
                <div className="goals-stack">
                  {canonical.goals.items.map((goal, idx) => (
                    <div key={goal.id || idx} className="goal-item-row">
                      <div className="goal-item-top">
                        <span className="goal-item-title">{goal.title}</span>
                        <span className="goal-item-status mono-num">{goal.status}</span>
                      </div>
                      <div className="goal-item-meta mono-num">
                        <span>Progress: {goal.progress ?? 0}%</span>
                        <span aria-hidden="true">·</span>
                        <span>Due: {goal.dueDate || 'Unknown'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-domain-notice">No goal records available.</div>
              )}
            </section>
          </div>
        )}

        {/* Skills, Learning & Career Section */}
        {showSection('learning') && (
          <div className="dash-two-col-grid">
            <section className="dash-section-card">
              <div className="dash-card-header">
                <h2>Skills &amp; Competencies</h2>
                <SemanticBadge
                  classification={
                    canonical.skills.technical.length > 0 ? 'Fact' : 'Unknown'
                  }
                />
              </div>

              <div className="sub-list-block">
                <h3>Technical Skills</h3>
                {canonical.skills.technical.length > 0 ? (
                  <p className="inline-separated-list">
                    {canonical.skills.technical.join(' · ')}
                  </p>
                ) : (
                  <FieldValueDisplay value={null} unknownLabel="No skill data available" />
                )}
              </div>

              <div className="sub-list-block">
                <h3>Core Competencies</h3>
                {canonical.skills.competencies.length > 0 ? (
                  <p className="inline-separated-list">
                    {canonical.skills.competencies.join(' · ')}
                  </p>
                ) : (
                  <FieldValueDisplay value={null} unknownLabel="No competency data available" />
                )}
              </div>

              <div className="sub-list-block">
                <h3>Identified Skill Gaps</h3>
                {canonical.skills.skillGaps.length > 0 ? (
                  <p className="inline-separated-list">
                    {canonical.skills.skillGaps.join(' · ')}
                  </p>
                ) : (
                  <FieldValueDisplay value={null} unknownLabel="None recorded / Unknown" />
                )}
              </div>

              <div className="sub-list-block">
                <h3>Career Promotions &amp; Aspirations</h3>
                {canonical.career.promotions.length > 0 ? (
                  <ul className="clean-bullet-list">
                    {canonical.career.promotions.map((p, idx) => (
                      <li key={idx}>
                        <strong>{p.designation}</strong> (Effective:{' '}
                        <span className="mono-num">{p.effectiveDate}</span>)
                        {p.notes ? ` — ${p.notes}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted-note">No promotion records in Zoho People.</p>
                )}
                <div className="kv-row-inline">
                  <span>Career Aspirations: </span>
                  <FieldValueDisplay value={canonical.career.aspirations} />
                </div>
              </div>
            </section>

            <section className="dash-section-card">
              <div className="dash-card-header">
                <h2>Learning &amp; Certifications</h2>
                <SemanticBadge classification="Fact" />
              </div>

              <div className="sub-list-block">
                <h3>Completed Courses ({canonical.learning.completedCourses.length})</h3>
                {canonical.learning.completedCourses.length > 0 ? (
                  <ul className="clean-bullet-list">
                    {canonical.learning.completedCourses.map((c, idx) => (
                      <li key={idx}>
                        {typeof c === 'string' ? (
                          c
                        ) : (
                          <>
                            <strong>{c.title}</strong>
                            {c.provider ? ` · ${c.provider}` : ''}
                            {c.completedDate ? (
                              <span className="mono-num"> ({c.completedDate})</span>
                            ) : null}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <FieldValueDisplay value={null} unknownLabel="No completed courses recorded" />
                )}
              </div>

              <div className="sub-list-block">
                <h3>Enrolled Courses ({canonical.learning.enrolledCourses.length})</h3>
                {canonical.learning.enrolledCourses.length > 0 ? (
                  <ul className="clean-bullet-list">
                    {canonical.learning.enrolledCourses.map((c, idx) => (
                      <li key={idx}>
                        {typeof c === 'string' ? (
                          c
                        ) : (
                          <>
                            <strong>{c.title}</strong>
                            {c.provider ? ` · ${c.provider}` : ''}
                            {c.progress !== undefined && c.progress !== null ? (
                              <span className="mono-num"> ({c.progress}% progress)</span>
                            ) : null}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <FieldValueDisplay value={null} unknownLabel="No enrolled courses recorded" />
                )}
              </div>

              <div className="sub-list-block">
                <h3>Verified Certifications ({canonical.learning.certifications.length})</h3>
                {canonical.learning.certifications.length > 0 ? (
                  <ul className="clean-bullet-list">
                    {canonical.learning.certifications.map((cert, idx) => (
                      <li key={idx}>
                        {typeof cert === 'string' ? (
                          cert
                        ) : (
                          <>
                            <strong>{cert.name}</strong>
                            {cert.issuer ? ` — ${cert.issuer}` : ''}
                            {cert.issuedDate ? (
                              <span className="mono-num"> ({cert.issuedDate})</span>
                            ) : null}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <FieldValueDisplay value={null} unknownLabel="No certifications recorded" />
                )}
              </div>
            </section>
          </div>
        )}

        {/* Attendance & Leave Section */}
        {showSection('attendance') && (
          <div className="dash-two-col-grid">
            <section className="dash-section-card">
              <div className="dash-card-header">
                <h2>Attendance Summary</h2>
                <SemanticBadge
                  classification={
                    metrics.attendancePercentage?.classification || 'Unknown'
                  }
                />
              </div>

              <dl className="kv-definition-grid">
                <div className="kv-row">
                  <dt>Summary Period</dt>
                  <dd>
                    <FieldValueDisplay value={canonical.attendance.summaryPeriod} />
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Total Working Days</dt>
                  <dd>
                    <FieldValueDisplay value={canonical.attendance.totalWorkingDays} mono />
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Present Days</dt>
                  <dd>
                    <FieldValueDisplay value={canonical.attendance.presentDays} mono />
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Absent Days</dt>
                  <dd>
                    <FieldValueDisplay value={canonical.attendance.absentDays} mono />
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Late Arrivals</dt>
                  <dd>
                    <FieldValueDisplay value={canonical.attendance.lateDays} mono />
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Attendance Rate</dt>
                  <dd>
                    <FieldValueDisplay
                      value={metrics.attendancePercentage?.formatted}
                      mono
                    />
                  </dd>
                </div>
              </dl>
            </section>

            <section className="dash-section-card">
              <div className="dash-card-header">
                <h2>Leave Balances &amp; Utilization</h2>
                <SemanticBadge
                  classification={metrics.leaveUtilization?.classification || 'Unknown'}
                />
              </div>

              {canonical.leave.balance.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Leave Type</th>
                      <th className="num-col">Entitled</th>
                      <th className="num-col">Taken</th>
                      <th className="num-col">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {canonical.leave.balance.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.type || 'Unknown'}</td>
                        <td className="num-col mono-num">{item.entitled ?? 'Unknown'}</td>
                        <td className="num-col mono-num">{item.taken ?? 'Unknown'}</td>
                        <td className="num-col mono-num">{item.balance ?? 'Unknown'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-domain-notice">
                  No leave balance records available in Zoho People (Unknown).
                </div>
              )}
            </section>
          </div>
        )}

        {/* Employee Timeline Section */}
        {showSection('timeline') && (
          <section className="dash-section-card">
            <div className="dash-card-header">
              <h2>Employee Lifecycle Timeline (/v1/employees/{employeeId}/timeline)</h2>
              <span className="mono-num">{timelineEvents.length} verified events</span>
            </div>

            {timelineEvents.length > 0 ? (
              <div className="timeline-vertical-list">
                {timelineEvents.map((ev) => (
                  <div key={ev.id} className="timeline-event-item">
                    <div className="timeline-event-date mono-num">{ev.date}</div>
                    <div className="timeline-event-marker" aria-hidden="true" />
                    <div className="timeline-event-content">
                      <div className="timeline-event-top">
                        <strong>{ev.title}</strong>
                        <span className="timeline-event-meta mono-num">
                          {ev.eventCode} · {ev.domain} · {ev.source}
                        </span>
                      </div>
                      {ev.description && <p>{ev.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-domain-notice">
                No timeline events available. Missing source dates are never fabricated into
                lifecycle events.
              </div>
            )}
          </section>
        )}

        {/* Grounded Evidence & Source Limitations Section */}
        {showSection('evidence') && (
          <section className="dash-section-card">
            <div className="dash-card-header">
              <h2>Grounded Evidence Trail &amp; Source Limitations</h2>
              <span className="mono-num">{canonical.evidence.length} evidence items</span>
            </div>

            {canonical.evidence.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Domain.Field</th>
                    <th>Classification</th>
                    <th>Verified Value</th>
                    <th>Source System</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {canonical.evidence.map((ev, idx) => (
                    <tr key={`${ev.domain}.${ev.field}-${idx}`}>
                      <td className="mono-num">
                        {ev.domain}.{ev.field}
                      </td>
                      <td>
                        <SemanticBadge classification={ev.classification} />
                      </td>
                      <td className="mono-num">
                        <FieldValueDisplay
                          value={
                            ev.value !== undefined && ev.value !== null
                              ? String(ev.value)
                              : null
                          }
                        />
                      </td>
                      <td>{ev.source}</td>
                      <td>{ev.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-domain-notice">
                No source evidence items extracted for this employee.
              </div>
            )}

            {canonical.limitations && canonical.limitations.length > 0 && (
              <div className="limitations-audit-box">
                <h3>Recorded Source Limitations &amp; Unpopulated Attributes</h3>
                <ul className="clean-bullet-list">
                  {canonical.limitations.map((lim, idx) => (
                    <li key={idx}>{lim}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};
