export interface ErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
  error?: ErrorResponse;
}
