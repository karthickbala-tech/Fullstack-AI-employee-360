import { API_ENDPOINTS, ASK_TIMEOUT_MS, VOICE_TIMEOUT_MS } from '../config/apiConfig';
import { apiRequest } from './apiClient';
import type {
  AccessProfile,
  AskAIResponse,
  AskMentions,
  AskHistoryTurn,
  Employee360Data,
  EmployeeDirectoryResponse,
  EmployeeInsightsResponse,
  EmployeeSummaryResponse,
  EmployeeTimelineResponse,
  VoiceSpeech,
  VoiceTranscription,
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

  /**
   * Chat question not tied to one employee (POST /v1/ask). Mentions narrow it to
   * people (@), departments (#) or everyone allowed (@all); the backend checks scope.
   */
  async askChat(
    question: string,
    history: AskHistoryTurn[] = [],
    mentions: AskMentions = { employeeIds: [], departments: [], all: false },
    /** Language the speech-to-text step heard (helps the backend translate); optional. */
    language?: string
  ): Promise<AskAIResponse> {
    const res = await apiRequest<AskAIResponse>(API_ENDPOINTS.askChat(), {
      method: 'POST',
      body: JSON.stringify({ question: question.trim(), history, mentions, ...(language ? { language } : {}) }),
      // text/plain keeps this a CORS "simple" request (see askEmployeeAI below).
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    }, ASK_TIMEOUT_MS);
    return res.data;
  },

  /** Speech to text (POST /v1/voice/transcribe): base64 audio of one recording. */
  async transcribeVoice(audio: string, mimeType: string): Promise<VoiceTranscription> {
    const res = await apiRequest<VoiceTranscription>(API_ENDPOINTS.voiceTranscribe(), {
      method: 'POST',
      body: JSON.stringify({ audio, mimeType }),
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    }, VOICE_TIMEOUT_MS);
    return res.data;
  },

  /** Text to speech (POST /v1/voice/speak): one MP3 clip of the answer. */
  async speakText(text: string, languageCode: string): Promise<VoiceSpeech> {
    const res = await apiRequest<VoiceSpeech>(API_ENDPOINTS.voiceSpeak(), {
      method: 'POST',
      body: JSON.stringify({ text, languageCode }),
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    }, VOICE_TIMEOUT_MS);
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
