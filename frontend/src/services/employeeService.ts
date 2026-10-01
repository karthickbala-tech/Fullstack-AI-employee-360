import { apiClient } from '../api/apiClient';
import { ZohoConnectionStatus, ZohoDirectoryEmployee } from '../types/employee360';

export interface EmployeesResponse {
  employees: ZohoDirectoryEmployee[];
  total: number;
  connected: boolean;
  connectionName: string;
  source: string;
}

export class EmployeeService {
  /**
   * Verify Zoho People Catalyst Connection status
   */
  public async getStatus(): Promise<ZohoConnectionStatus> {
    return apiClient.get<ZohoConnectionStatus>('/v1/zoho/status');
  }

  /**
   * Retrieve live employee directory from Zoho People
   */
  public async getEmployees(): Promise<EmployeesResponse> {
    return apiClient.get<EmployeesResponse>('/v1/zoho/employees');
  }
}

export const employeeService = new EmployeeService();
export default employeeService;
