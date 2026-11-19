/**
 * Thrown by `apiFetch` for every non-2xx response AND for a network failure
 * (fetch throwing before a response is even received). `statusCode: 0` marks
 * the network-failure case — there was never an HTTP status to report.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly missing?: string[];
  readonly errors?: Record<string, unknown>;
  /** The full parsed response body, when there was one — e.g. a 422's report
   *  body on `POST /v1/admin/courts/import` (TASK_80), which carries more
   *  than just `message`. */
  readonly body?: unknown;
  /** Parsed from a `Retry-After` response header, in seconds, when present
   *  (e.g. a 429 from a rate limiter). */
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    statusCode: number,
    extra?: { missing?: string[]; errors?: Record<string, unknown>; body?: unknown; retryAfterSeconds?: number },
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.missing = extra?.missing;
    this.errors = extra?.errors;
    this.body = extra?.body;
    this.retryAfterSeconds = extra?.retryAfterSeconds;
  }
}

export const NETWORK_ERROR_MESSAGE = "Can't reach the server";
