import { apiClient } from '../api/apiClient';
import { EmployeeInsightsResponse } from '../types/employee360';

export class InsightsService {
  /**
   * Fetch backend generated employee insights with deterministic metrics and classifications
   */
  public async getEmployeeInsights(employeeId: string): Promise<EmployeeInsightsResponse> {
    const cleanId = encodeURIComponent(employeeId.trim());
    return apiClient.get<EmployeeInsightsResponse>(`/v1/employees/${cleanId}/insights`);
  }
}

export const insightsService = new InsightsService();
export default insightsService;
