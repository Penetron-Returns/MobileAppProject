import type { ApiErrorCode } from '@booking/types';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_FAILED: 400,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NO_BUSINESS: 403,
  NOT_FOUND: 404,
  SLOT_UNAVAILABLE: 409,
  WINDOW_CLOSED: 409,
  IDEMPOTENCY_KEY_REUSED: 422,
  RULE_VIOLATION: 422,
  FEATURE_NOT_IN_PLAN: 403,
  RATE_LIMITED: 429,
  UPSTREAM_META_ERROR: 502,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ApiErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export const notFound = (entity: string) => new AppError('NOT_FOUND', `${entity} not found`);
export const forbidden = (message = 'Forbidden') => new AppError('FORBIDDEN', message);
export const ruleViolation = (rule: string, message: string) =>
  new AppError('RULE_VIOLATION', message, { rule });

/** Shape of errors returned by supabase-js / PostgREST. */
export interface PostgrestLikeError {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

/**
 * Maps a Postgres/PostgREST error raised by our RPCs into an AppError.
 * See docs/BUILD_PLAN.md §3 "RPCs" for the SQLSTATE conventions.
 */
export function mapDbError(error: PostgrestLikeError): AppError {
  const code = error.code ?? '';
  if (code === '23P01') {
    return new AppError('SLOT_UNAVAILABLE', 'That time slot is no longer available');
  }
  if (code === 'P0002' || code === 'PGRST116') {
    return new AppError('NOT_FOUND', error.message || 'Not found');
  }
  if (code === 'P0001' && error.message.startsWith('RULE:')) {
    const [, rule = 'UNKNOWN', ...rest] = error.message.split(':');
    const message = rest.join(':').trim() || rule;
    return ruleViolation(rule, message);
  }
  if (code === '23505') {
    return new AppError('VALIDATION_FAILED', 'Duplicate value', { constraint: error.details ?? null });
  }
  if (code === '23503' || code === '23514' || code === '22P02') {
    return new AppError('VALIDATION_FAILED', 'Invalid reference or value', { pg_code: code });
  }
  return new AppError('INTERNAL', 'Database error', { pg_code: code || null });
}

/** Unwraps a supabase-js `{ data, error }` result, throwing a mapped AppError. */
export function unwrap<T>(result: { data: T | null; error: PostgrestLikeError | null }): T {
  if (result.error) throw mapDbError(result.error);
  return result.data as T;
}
