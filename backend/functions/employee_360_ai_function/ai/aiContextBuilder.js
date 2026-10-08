'use strict';

// Optional context sections and the words that ask for them. The profile and
// employment sections are always sent: they are small and identify the subject.
const DOMAIN_KEYWORDS = {
  attendance: /\b(attendance|absent|absence|absences|present|late|punctual|punctuality|check-?in|punch)/,
  leave: /\b(leaves?|vacation|time off|holidays?|sick)\b/,
  performance: /\b(performance|ratings?|appraisal|review|strengths?|development|goals?|kpis?|okrs?)\b/,
  lifecycle: /\b(resign\w*|terminat\w*|exit|separation|notice period|deceased|lifecycle|leaving)\b/
};

const OPTIONAL_DOMAINS = Object.keys(DOMAIN_KEYWORDS);

// Evidence domains that belong to the always-sent sections.
const ALWAYS_SENT_EVIDENCE_DOMAINS = ['employee', 'employment', 'organisation'];

class AIContextBuilder {
  /**
   * Picks the optional domains mentioned in the given texts (the question and
   * recent user turns). When none is mentioned, every domain is selected so an
   * open question still sees the whole authorized context.
   */
  static selectDomains(texts = []) {
    const text = texts.filter(Boolean).join('\n').toLowerCase();
    const selected = OPTIONAL_DOMAINS.filter(domain => DOMAIN_KEYWORDS[domain].test(text));
    return new Set(selected.length > 0 ? selected : OPTIONAL_DOMAINS);
  }

  /**
   * Returns the sanitized context object. Evidence carries metadata only; values
   * and source record IDs are never included. `options.domains` limits the
   * optional sections and their evidence; omitted, everything is included.
   */
  static buildContext(canonical = {}, options = {}) {
    const domains = options.domains || new Set(OPTIONAL_DOMAINS);
    const evidenceDomains = new Set([...ALWAYS_SENT_EVIDENCE_DOMAINS, ...domains]);

    const evidence = Array.isArray(canonical.evidence)
      ? canonical.evidence
          .filter(item => evidenceDomains.has(item?.domain))
          .map(item => ({
            domain: item?.domain || 'Unknown',
            field: item?.field || 'Unknown',
            classification: item?.classification || 'Unknown',
            source: item?.source || 'Unknown',
            confidence: item?.confidence || 'Unknown',
            notes: item?.notes || null
          }))
      : [];

    const context = {
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
      }
    };

    if (domains.has('performance')) {
      context.performance = {
        overallRating:
          canonical.performance?.overallRating !== null &&
          canonical.performance?.overallRating !== undefined
            ? canonical.performance.overallRating
            : 'Not evaluated',
        strengths: canonical.performance?.strengths || [],
        developmentAreas: canonical.performance?.developmentAreas || []
      };
    }

    if (domains.has('attendance')) {
      context.attendance = {
        percentage:
          canonical.deterministicMetrics?.attendancePercentage?.formatted ||
          'Unknown',
        lateDays:
          canonical.deterministicMetrics?.attendancePercentage?.formatted !== 'Unknown'
            ? canonical.attendance?.lateDays
            : 'Unknown'
      };
    }

    if (domains.has('leave')) {
      context.leave = {
        utilization:
          canonical.deterministicMetrics?.leaveUtilization?.formatted ||
          'Unknown'
      };
    }

    if (domains.has('lifecycle')) {
      context.lifecycle = {
        currentStage: canonical.lifecycle?.currentStage || 'Unknown',
        exitInitiated:
          canonical.lifecycle?.exitInitiated === null || canonical.lifecycle?.exitInitiated === undefined
            ? 'Unknown'
            : canonical.lifecycle.exitInitiated,
        exitDate: canonical.lifecycle?.exitDate || 'Unknown'
      };
    }

    context.evidence = evidence;
    context.knownLimitations = canonical.limitations || [];

    return context;
  }

  /**
   * Context as a JSON string for the summary and insight prompts: the sections
   * they have always received (lifecycle is sent only to Ask when asked about).
   */
  static buildPromptContext(canonical = {}) {
    const domains = new Set(['attendance', 'leave', 'performance']);
    return JSON.stringify(AIContextBuilder.buildContext(canonical, { domains }), null, 2);
  }
}

module.exports = AIContextBuilder;
