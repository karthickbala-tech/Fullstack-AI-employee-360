import { apiClient } from '../api/apiClient';
import { AskAIResponse } from '../types/employee360';

export class AskAIService {
  /**
   * Send question to backend AI engine for grounding against Employee 360 context
   */
  public async askQuestion(employeeId: string, question: string): Promise<AskAIResponse> {
    const cleanId = encodeURIComponent(employeeId.trim());
    return apiClient.post<AskAIResponse>(`/v1/employees/${cleanId}/ask`, {
      question: question.trim()
    });
  }
}

export const askAIService = new AskAIService();
export default askAIService;
