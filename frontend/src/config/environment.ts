/**
 * Frontend Safe Runtime Configuration
 * 
 * Strict Security Boundaries:
 * - NO Zoho OAuth tokens or refresh tokens
 * - NO Catalyst connection credentials
 * - NO Gemini API keys
 * - Only publicly safe API base URLs and feature flags
 */

export interface AppConfig {
  apiBaseUrl: string;
  timeoutMs: number;
  appName: string;
  version: string;
  zohoWebTabMode: boolean;
}

export const config: AppConfig = {
  // Configurable base URL: can be overridden via Vite env var or default to the verified Catalyst Advanced I/O path
  apiBaseUrl:
  ((import.meta as any).env?.VITE_API_BASE_URL as string) ||
  'https://employee360-ai-60085182165.development.catalystserverless.in/server/employee_360_ai_function',
  timeoutMs: 15000,
  appName: 'AI Employee 360',
  version: '1.0.0',
  zohoWebTabMode: true
};

export default config;
