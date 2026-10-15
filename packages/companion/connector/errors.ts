/**
 * Nerova Booking MCP v1 error codes (docs: guides/nerova-booking-mcp-v1).
 * Nerova reads `code` and never the text, so the mapping from our AppError
 * codes must be stable.
 */
import { AppError } from '@booking/features/lib/errors.ts';

export type ConnectorErrorCode =
  | 'invalid_request'
  | 'unauthorized'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'provider_unavailable';

export class ConnectorError extends Error {
  readonly code: ConnectorErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(code: ConnectorErrorCode, detail: string, retryAfterSeconds?: number) {
    super(detail);
    this.name = 'ConnectorError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export const invalidRequest = (detail: string) => new ConnectorError('invalid_request', detail);
export const connectorNotFound = (what: string) => new ConnectorError('not_found', `${what} not found`);

/** Our API codes → connector codes. Rule violations are state conflicts (inactive service, blocked client, window). */
const CODE_MAP: Record<AppError['code'], ConnectorErrorCode> = {
  VALIDATION_FAILED: 'invalid_request',
  IDEMPOTENCY_KEY_REQUIRED: 'invalid_request',
  UNAUTHENTICATED: 'unauthorized',
  FORBIDDEN: 'unauthorized',
  NO_BUSINESS: 'not_found',
  NOT_FOUND: 'not_found',
  SLOT_UNAVAILABLE: 'conflict',
  WINDOW_CLOSED: 'conflict',
  IDEMPOTENCY_KEY_REUSED: 'conflict',
  RULE_VIOLATION: 'conflict',
  FEATURE_NOT_IN_PLAN: 'not_found',
  RATE_LIMITED: 'rate_limited',
  UPSTREAM_META_ERROR: 'provider_unavailable',
  COMPANION_NOT_READY: 'provider_unavailable',
  UPSTREAM_COMPANION_ERROR: 'provider_unavailable',
  INTERNAL: 'provider_unavailable',
};

/** Anything unexpected becomes provider_unavailable with a fixed, non-leaky detail. */
export function toConnectorError(error: unknown): ConnectorError {
  if (error instanceof ConnectorError) return error;
  if (error instanceof AppError) {
    const code = CODE_MAP[error.code];
    // Internal details stay in our logs.
    const detail = code === 'provider_unavailable' ? 'The booking system cannot answer right now.' : error.message;
    return new ConnectorError(code, detail);
  }
  return new ConnectorError('provider_unavailable', 'The booking system cannot answer right now.');
}
