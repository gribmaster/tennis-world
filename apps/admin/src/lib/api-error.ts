/**
 * Thrown by `apiFetch` for every non-2xx response AND for a network failure
 * (fetch throwing before a response is even received). `statusCode: 0` marks
 * the network-failure case — there was never an HTTP status to report.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly missing?: string[];
  readonly errors?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number,
    extra?: { missing?: string[]; errors?: Record<string, unknown> },
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.missing = extra?.missing;
    this.errors = extra?.errors;
  }
}

export const NETWORK_ERROR_MESSAGE = "Can't reach the server";
