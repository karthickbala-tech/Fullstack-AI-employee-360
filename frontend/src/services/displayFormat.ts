/**
 * Display rules for Employee 360 values: what a metric card shows when the
 * value is present, and a clear sentence when it is not (never "null", never a
 * bare "Unknown"). Pure functions only, so they are unit-tested directly.
 * Values are never invented: a missing value is labelled missing.
 */
import type { DataClassification, Employee360Data } from '../types/employee360';

export interface KpiView {
  value: string;
  sub: string;
  classification: DataClassification;
  /** True when the source has no value: the card shows the value muted. */
  missing: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** "2023-06-15" or "19-Jul-2024" → "15 Jun 2023" / "19 Jul 2024"; anything else unchanged. */
export function formatDisplayDate(value: string | null | undefined): string | null {
  if (!value || !String(value).trim()) return null;
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const month = MONTHS[Number(iso[2]) - 1];
    return month ? `${Number(iso[3])} ${month} ${iso[1]}` : text;
  }
  const zoho = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (zoho) return `${Number(zoho[1])} ${zoho[2].charAt(0).toUpperCase()}${zoho[2].slice(1).toLowerCase()} ${zoho[3]}`;
  return text;
}

/** A plain field value, or "Not recorded" when it is missing. */
export function orNotRecorded(value: string | null | undefined): string {
  return value && String(value).trim() ? String(value) : 'Not recorded';
}

function missingKpi(value: string, sub: string): KpiView {
  return { value, sub, classification: 'Unknown', missing: true };
}

export function tenureKpi(canonical: Employee360Data): KpiView {
  const tenure = canonical.deterministicMetrics?.tenure;
  const joined = formatDisplayDate(canonical.employment?.dateOfJoining);
  if (!tenure || !tenure.formatted || tenure.formatted === 'Unknown') {
    return missingKpi('Not recorded', 'Joining date not recorded in Zoho People');
  }
  return {
    value: tenure.formatted,
    sub: joined ? `Joined ${joined}` : 'Joining date not recorded',
    classification: tenure.classification || 'Calculation',
    missing: false,
  };
}

export function attendanceKpi(canonical: Employee360Data): KpiView {
  const metric = canonical.deterministicMetrics?.attendancePercentage;
  const present = canonical.attendance?.presentDays;
  const total = canonical.attendance?.totalWorkingDays;
  if (!metric || !isNumber(metric.value)) {
    return missingKpi('No data', 'No attendance records for this period');
  }
  return {
    value: metric.formatted || `${metric.value}%`,
    sub: isNumber(present) && isNumber(total) ? `${present} of ${total} working days present` : 'Working days not recorded',
    classification: metric.classification || 'Calculation',
    missing: false,
  };
}

export function leaveKpi(canonical: Employee360Data): KpiView {
  const metric = canonical.deterministicMetrics?.leaveUtilization;
  const taken = canonical.leave?.takenThisYear;
  if (!metric || !isNumber(metric.value)) {
    return missingKpi(
      'No data',
      isNumber(taken) ? `${taken} day${taken === 1 ? '' : 's'} taken; entitlement not recorded` : 'No leave records for this year'
    );
  }
  return {
    value: metric.formatted || `${metric.value}%`,
    sub: isNumber(taken) ? `${taken} day${taken === 1 ? '' : 's'} taken this year` : 'Days taken not recorded',
    classification: metric.classification || 'Calculation',
    missing: false,
  };
}

export function appraisalKpi(canonical: Employee360Data): KpiView {
  const rating = canonical.deterministicMetrics?.performanceRating;
  if (!rating || !isNumber(rating.value)) {
    return missingKpi('Not available', 'No appraisal rating recorded in Zoho People');
  }
  return {
    value: `${rating.value} / 5.0`,
    sub: canonical.performance?.currentReviewPeriod || 'Review period not recorded',
    classification: rating.classification || 'Fact',
    missing: false,
  };
}

export function learningKpi(canonical: Employee360Data): KpiView {
  const completed =
    (canonical.learning?.completedCourses?.length || 0) + (canonical.learning?.certifications?.length || 0);
  const enrolled = canonical.learning?.enrolledCourses?.length || 0;
  if (completed === 0 && enrolled === 0) {
    return missingKpi('Not available', 'No learning records in Zoho People');
  }
  return {
    value: `${completed} completed`,
    sub: enrolled > 0 ? `${enrolled} in progress` : 'None in progress',
    classification: 'Fact',
    missing: false,
  };
}

export function evidenceKpi(canonical: Employee360Data): KpiView {
  const count = canonical.evidence?.length || 0;
  if (count === 0) return missingKpi('None yet', 'No verified source fields');
  return {
    value: `${count} record${count === 1 ? '' : 's'}`,
    sub: 'Verified source fields',
    classification: 'Fact',
    missing: false,
  };
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Key facts worth bolding in a summary sentence.
const FACT_PATTERNS = [
  /\b\d{4}-\d{2}-\d{2}\b/g, // 2023-06-15
  /\b\d{1,2}-[A-Z][a-z]{2}-\d{4}\b/g, // 19-Jul-2024
  /\b\d+ years?(?: and \d+ months?)?\b/g, // 3 years and 3 months
  /\b\d+ yrs? \d+ mos?\b/g, // 3 yrs 3 mos
  /\b\d+(?:\.\d+)? ?\/ ?5(?:\.0)?\b/g, // 4.6 / 5.0
  /\b\d+(?:\.\d+)?%/g, // 96%
];

/**
 * Bolds the key facts in a summary that has no bold of its own: the employee's
 * name, role, department, location and manager (from the verified record), and
 * dates, durations, ratings and percentages. Text that already uses **bold**
 * (the backend summaries) is left exactly as written.
 */
export function emphasizeKeyFacts(text: string, terms: Array<string | null | undefined> = []): string {
  if (!text || text.includes('**')) return text;
  const ranges: Array<[number, number]> = [];
  const add = (start: number, end: number) => {
    if (ranges.some(([s, e]) => start < e && end > s)) return;
    ranges.push([start, end]);
  };
  const cleanTerms = [...new Set(terms.filter((t): t is string => Boolean(t && t.trim().length >= 3)).map((t) => t.trim()))]
    .sort((a, b) => b.length - a.length);
  for (const term of cleanTerms) {
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'g');
    for (const match of text.matchAll(pattern)) add(match.index ?? 0, (match.index ?? 0) + match[0].length);
  }
  for (const pattern of FACT_PATTERNS) {
    for (const match of text.matchAll(pattern)) add(match.index ?? 0, (match.index ?? 0) + match[0].length);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let result = '';
  let cursor = 0;
  for (const [start, end] of ranges) {
    result += `${text.slice(cursor, start)}**${text.slice(start, end)}**`;
    cursor = end;
  }
  return result + text.slice(cursor);
}
