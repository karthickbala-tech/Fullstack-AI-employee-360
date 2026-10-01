import { apiClient } from '../api/apiClient';
import { EmployeeSummaryResponse } from '../types/employee360';

export class SummaryService {
  /**
   * Fetch backend generated employee summary
   */
  public async getEmployeeSummary(employeeId: string): Promise<EmployeeSummaryResponse> {
    const cleanId = encodeURIComponent(employeeId.trim());
    return apiClient.get<EmployeeSummaryResponse>(`/v1/employees/${cleanId}/summary`);
  }
}

export const summaryService = new SummaryService();
export default summaryService;
