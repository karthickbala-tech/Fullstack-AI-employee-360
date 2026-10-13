import type { DataSourceMode } from '../types/employee360';

/**
 * Centralized API Configuration for AI Employee 360.
 *
 * The deployed Catalyst serverless backend URL is configured here as the single
 * source of truth for all live API requests.
 *
 * To switch the default experience from demo/mock data to the live Catalyst API:
 * Change `DEFAULT_DATA_SOURCE_MODE` to `'live'` or set `VITE_USE_MOCK_DATA=false`.
 */

export const DEPLOYED_BACKEND_BASE_URL =
  'https://employee360-ai-60085182165.development.catalystserverless.in/server/employee_360_ai_function';

export const API_BASE_URL: string = (
  import.meta.env.VITE_API_BASE_URL || DEPLOYED_BACKEND_BASE_URL
).replace(/\/+$/, '');

export const DEFAULT_DATA_SOURCE_MODE: DataSourceMode =
  import.meta.env.VITE_USE_MOCK_DATA === 'false' ? 'live' : 'mock';

export const API_TIMEOUT_MS = 20000;
/** Chat answers: the backend gives up on translation at 18 s and its AI at ~12 s. */
export const ASK_TIMEOUT_MS = 28000;
/** Speech-to-text: Sarvam is given 15 s on the server. */
export const VOICE_TIMEOUT_MS = 22000;

export const API_ENDPOINTS = {
  me: () => `${API_BASE_URL}/v1/me`,
  askChat: () => `${API_BASE_URL}/v1/ask`,
  voiceTranscribe: () => `${API_BASE_URL}/v1/voice/transcribe`,
  voiceSpeak: () => `${API_BASE_URL}/v1/voice/speak`,
  zohoStatus: () => `${API_BASE_URL}/v1/zoho/status`,
  zohoEmployees: () => `${API_BASE_URL}/v1/zoho/employees`,
  employee360: (employeeId: string) =>
    `${API_BASE_URL}/v1/employees/${encodeURIComponent(employeeId.trim())}/360`,
  employeeSummary: (employeeId: string) =>
    `${API_BASE_URL}/v1/employees/${encodeURIComponent(employeeId.trim())}/summary`,
  employeeInsights: (employeeId: string) =>
    `${API_BASE_URL}/v1/employees/${encodeURIComponent(employeeId.trim())}/insights`,
  employeeTimeline: (employeeId: string) =>
    `${API_BASE_URL}/v1/employees/${encodeURIComponent(employeeId.trim())}/timeline`,
  employeeAsk: (employeeId: string) =>
    `${API_BASE_URL}/v1/employees/${encodeURIComponent(employeeId.trim())}/ask`,
} as const;

export const SUGGESTED_AI_PROMPTS: string[] = [
  'What do we know about this employee?',
  'Summarize this employee.',
  "What are the employee's performance trends?",
  'What skills and learning information are available?',
  'What should I know about this employee?',
];
