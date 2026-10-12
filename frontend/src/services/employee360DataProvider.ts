import { employee360Api } from '../api/employee360Api';
import { ApiClientError, INVALID_ASSERTION_CODE } from '../api/apiClient';
import { employee360MockService } from '../mock/employee360MockData';
import { describeIdentityStatus } from './webTabIdentity';
import type {
  AccessProfile,
  AskAIResponse,
  AskHistoryTurn,
  DataSourceMode,
  Employee360Data,
  EmployeeDirectoryEntry,
  EmployeeDirectoryResponse,
  EmployeeInsightsResponse,
  EmployeeSummaryResponse,
  EmployeeTimelineResponse,
  ZohoConnectionStatus,
} from '../types/employee360';

/**
 * Unified Data Provider Abstraction.
 *
 * - When `mode === 'live'`, calls `employee360Api` directly against the deployed Catalyst
 *   serverless backend (`https://employee360-ai-60085182165.development.catalystserverless.in/server/employee_360_ai_function/`).
 *   Live API responses and errors are NEVER silently overridden by mock data.
 * - When `mode === 'mock'`, returns the isolated demo dataset from `employee360MockService`.
 */
export function getEmployee360Provider(mode: DataSourceMode) {
  if (mode === 'live') {
    return employee360Api;
  }
  return employee360MockService;
}

export interface FullEmployee360Bundle {
  canonical: Employee360Data;
  summary: EmployeeSummaryResponse;
  insights: EmployeeInsightsResponse;
  timeline: EmployeeTimelineResponse;
}

// Bundle requests currently in flight, keyed by mode + employee. A second caller asking for
// the same bundle while the first is still pending (React StrictMode double-mounting effects
// in dev, or a manual refresh overlapping an automatic load) shares the pending promise
// instead of firing duplicate /summary and /insights requests, each of which calls Gemini.
// Entries are removed once settled, so this never serves stale data.
const inFlightBundles = new Map<string, Promise<FullEmployee360Bundle>>();

export function fetchEmployee360Bundle(
  employeeId: string,
  mode: DataSourceMode
): Promise<FullEmployee360Bundle> {
  const key = `${mode}:${employeeId.trim()}`;
  const pending = inFlightBundles.get(key);
  if (pending) return pending;

  const request = loadEmployee360Bundle(employeeId, mode).finally(() => {
    inFlightBundles.delete(key);
  });
  inFlightBundles.set(key, request);
  return request;
}

async function loadEmployee360Bundle(
  employeeId: string,
  mode: DataSourceMode
): Promise<FullEmployee360Bundle> {
  const provider = getEmployee360Provider(mode);

  const [canonical, summary, insights, timeline] = await Promise.all([
    provider.getEmployee360(employeeId),
    provider.getEmployeeSummary(employeeId),
    provider.getEmployeeInsights(employeeId),
    provider.getEmployeeTimeline(employeeId),
  ]);

  return {
    canonical,
    summary,
    insights,
    timeline,
  };
}

export async function fetchDirectoryAndStatus(mode: DataSourceMode): Promise<{
  status: ZohoConnectionStatus;
  directory: EmployeeDirectoryResponse;
}> {
  const provider = getEmployee360Provider(mode);
  const [status, directory] = await Promise.all([
    provider.getZohoStatus(),
    provider.getEmployeeDirectory(),
  ]);
  return { status, directory };
}

export interface LiveAccessResult {
  access: AccessProfile;
  state: 'development' | 'authorized' | 'no_employee_mapping';
  employees: EmployeeDirectoryEntry[];
  /** The caller's own employee record when the backend identified one. */
  defaultEmployeeId: string | null;
  status: ZohoConnectionStatus | null;
  /** Shown to the user when access is limited or identity is not verified. */
  notice: string | null;
}

function toDirectoryEntry(entry: { employeeId: string; fullName: string | null }): EmployeeDirectoryEntry {
  return {
    recordId: null,
    employeeId: entry.employeeId,
    fullName: entry.fullName,
    jobTitle: null,
    department: null,
    email: null,
    workLocation: null,
    status: null,
  };
}

/**
 * Live mode: GET /v1/me decides which employees the Web Tab may show.
 * - Authentication off (Development): the backend reports it explicitly; the
 *   full directory is used and the page says identity is not verified.
 * - Organization scope granted by the backend: the full directory.
 * - Otherwise: only the backend's allowedEmployees, defaulting to the caller's
 *   own record. The unrestricted directory is never used as a fallback.
 */
export async function fetchLiveAccess(): Promise<LiveAccessResult> {
  const access = await employee360Api.getMe();

  if (access.authenticationEnabled === false) {
    const { status, directory } = await fetchDirectoryAndStatus('live');
    return {
      access,
      state: 'development',
      employees: directory.employees || [],
      defaultEmployeeId: null,
      status,
      notice:
        'Development mode: backend authentication is off, so the signed-in Zoho People user is not verified. ' +
        describeIdentityStatus(),
    };
  }

  if (access.scope === 'all') {
    const { status, directory } = await fetchDirectoryAndStatus('live');
    return {
      access,
      state: 'authorized',
      employees: directory.employees || [],
      defaultEmployeeId: access.employeeId,
      status,
      notice: null,
    };
  }

  const employees = (access.allowedEmployees || []).map(toDirectoryEntry);
  return {
    access,
    state: employees.length === 0 ? 'no_employee_mapping' : 'authorized',
    employees,
    defaultEmployeeId: access.employeeId,
    status: null,
    notice: employees.length === 0 ? MAPPING_NOTICES[access.employeeMapping || ''] || MAPPING_NOTICES.default : null,
  };
}

const MAPPING_NOTICES: Record<string, string> = {
  ambiguous:
    'Your Zoho People email matches more than one employee record, so no Employee 360 data is available. Ask your administrator to correct the duplicate.',
  not_found:
    'No Zoho People employee record matches your sign-in email, so no Employee 360 data is available.',
  no_email: 'Your sign-in has no email address, so it cannot be matched to an employee record.',
  default: 'Your sign-in is not matched to a unique employee record, so no Employee 360 data is available.',
};

export type LiveAccessFailure =
  | 'invalid_assertion'
  | 'unauthenticated'
  | 'forbidden'
  | 'network_error'
  | 'backend_error';

/** Turns a failed GET /v1/me into a state and a message the user can act on. */
export function describeAccessFailure(err: unknown): { state: LiveAccessFailure; message: string } {
  const identity = describeIdentityStatus();
  if (err instanceof ApiClientError) {
    if (err.kind === 'unauthorized' && err.code === INVALID_ASSERTION_CODE) {
      return {
        state: 'invalid_assertion',
        message: `Your Zoho People identity could not be verified by the Employee 360 backend. ${identity}`,
      };
    }
    if (err.kind === 'unauthorized') {
      return { state: 'unauthenticated', message: `You are not signed in to Employee 360. ${identity}` };
    }
    if (err.kind === 'forbidden') {
      return { state: 'forbidden', message: `Employee 360 refused access: ${err.message}` };
    }
    if (err.kind === 'network_error' || err.kind === 'timeout') {
      return { state: 'network_error', message: err.message };
    }
    return { state: 'backend_error', message: `[${err.code || err.kind.toUpperCase()}] ${err.message}` };
  }
  return { state: 'backend_error', message: 'Unable to determine your Employee 360 access.' };
}

export async function askEmployeeQuestion(
  employeeId: string,
  question: string,
  mode: DataSourceMode,
  history: AskHistoryTurn[] = []
): Promise<AskAIResponse> {
  const provider = getEmployee360Provider(mode);
  return provider.askEmployeeAI(employeeId, question, history);
}
