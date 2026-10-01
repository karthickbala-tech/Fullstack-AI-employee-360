export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  meta?: {
    timestamp: string;
    employeeId?: string;
    question?: string;
    [key: string]: any;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface ApiClientConfig {
  baseUrl: string;
  timeoutMs: number;
}
