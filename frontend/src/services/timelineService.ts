import { apiClient } from '../api/apiClient';
import { EmployeeTimelineResponse } from '../types/employee360';

export class TimelineService {
  /**
   * Fetch verified employee timeline events
   */
  public async getEmployeeTimeline(employeeId: string): Promise<EmployeeTimelineResponse> {
    const cleanId = encodeURIComponent(employeeId.trim());
    return apiClient.get<EmployeeTimelineResponse>(`/v1/employees/${cleanId}/timeline`);
  }
}

export const timelineService = new TimelineService();
export default timelineService;
