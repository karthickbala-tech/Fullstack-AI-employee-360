import { apiClient } from '../api/apiClient';
import { Employee360Data } from '../types/employee360';

export class Employee360Service {
  /**
   * Fetch canonical Employee 360 profile from backend
   */
  public async getEmployee360(employeeId: string): Promise<Employee360Data> {
    const cleanId = encodeURIComponent(employeeId.trim());
    return apiClient.get<Employee360Data>(`/v1/employees/${cleanId}/360`);
  }
}

export const employee360Service = new Employee360Service();
export default employee360Service;
