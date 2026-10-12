import { API_ENDPOINTS } from '../config/apiConfig';
import { apiRequest } from './apiClient';
import type {
  AccessProfile,
  AskAIResponse,
  AskHistoryTurn,
  Employee360Data,
  EmployeeDirectoryResponse,
  EmployeeInsightsResponse,
  EmployeeSummaryResponse,
  EmployeeTimelineResponse,
  ZohoConnectionStatus,
} from '../types/employee360';

/**
 * Live Backend API Service Layer.
 * Consumes ONLY the verified Catalyst serverless endpoints defined in FRONTEND_API_CONTRACT.md.
 * Never calls Zoho People or Gemini directly.
 */
export const employee360Api = {
  async getMe(): Promise<AccessProfile> {
    const res = await apiRequest<AccessProfile>(API_ENDPOINTS.me(), {
      method: 'GET',
    });
    return res.data;
  },

  async getZohoStatus(): Promise<ZohoConnectionStatus> {
    const res = await apiRequest<ZohoConnectionStatus>(API_ENDPOINTS.zohoStatus(), {
      method: 'GET',
    });
    return res.data;
  },

  async getEmployeeDirectory(): Promise<EmployeeDirectoryResponse> {
    const res = await apiRequest<EmployeeDirectoryResponse>(
      API_ENDPOINTS.zohoEmployees(),
      {
        method: 'GET',
      }
    );
    return res.data;
  },

  async getEmployee360(employeeId: string): Promise<Employee360Data> {
    const res = await apiRequest<Employee360Data>(
      API_ENDPOINTS.employee360(employeeId),
      {
        method: 'GET',
      }
    );
    return res.data;
  },

  async getEmployeeSummary(employeeId: string): Promise<EmployeeSummaryResponse> {
    const res = await apiRequest<EmployeeSummaryResponse>(
      API_ENDPOINTS.employeeSummary(employeeId),
      {
        method: 'GET',
      }
    );
    return res.data;
  },

  async getEmployeeInsights(employeeId: string): Promise<EmployeeInsightsResponse> {
    const res = await apiRequest<EmployeeInsightsResponse>(
      API_ENDPOINTS.employeeInsights(employeeId),
      {
        method: 'GET',
      }
    );
    return res.data;
  },

  async getEmployeeTimeline(employeeId: string): Promise<EmployeeTimelineResponse> {
    const res = await apiRequest<EmployeeTimelineResponse>(
      API_ENDPOINTS.employeeTimeline(employeeId),
      {
        method: 'GET',
      }
    );
    return res.data;
  },

  async askEmployeeAI(
    employeeId: string,
    question: string,
    history: AskHistoryTurn[] = []
  ): Promise<AskAIResponse> {
    const res = await apiRequest<AskAIResponse>(
      API_ENDPOINTS.employeeAsk(employeeId),
      {
        method: 'POST',
        body: JSON.stringify({ question: question.trim(), history }),
        // The body is still JSON (the backend parses the raw body regardless of
        // Content-Type). text/plain keeps this a CORS "simple" request: with
        // application/json the browser sends an OPTIONS preflight, which the Catalyst
        // gateway answers itself without CORS headers for the Web Tab origin, so the
        // browser blocks the POST before it is sent ([NETWORK_ERROR] in Ask AI).
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      }
    );
    return res.data;
  },
};
