import { ERROR_MESSAGES, type ErrorCode } from '@empirica/shared';

/** An error the client is meant to see: a code and a plain message. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = 'ApiError';
    this.code = code;
    if (details) this.details = details;
  }
}
