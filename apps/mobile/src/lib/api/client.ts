import * as Crypto from 'expo-crypto';

import type { ApiErrorBody, ApiErrorCode } from '@booking/types';

import { getSessionToken } from '../auth-token';
import { env } from '../env';
import { fetchWithTimeout } from '../fetchWithTimeout';

/** Client-side codes for failures that never reached the API. */
export type ClientErrorCode =
  | 'NETWORK_ERROR'
  | 'OFFLINE'
  | 'BAD_RESPONSE'
  | 'NOT_CONFIGURED'
  | 'NOT_SIGNED_IN';

export class ApiError extends Error {
  readonly code: ApiErrorCode | ClientErrorCode;
  readonly status: number;
  readonly requestId: string | null;
  readonly details?: Record<string, unknown>;

  constructor(opts: {
    code: ApiErrorCode | ClientErrorCode;
    message: string;
    status: number;
    requestId?: string | null;
    details?: Record<string, unknown>;
  }) {
    super(opts.message);
    this.name = 'ApiError';
    this.code = opts.code;
    this.status = opts.status;
    this.requestId = opts.requestId ?? null;
    this.details = opts.details;
  }

  /** Worth retrying with the SAME idempotency key (the server may not have seen it). */
  get isRetryable() {
    return (
      this.code === 'NETWORK_ERROR' ||
      this.code === 'RATE_LIMITED' ||
      this.status >= 500
    );
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export function newIdempotencyKey(): string {
  return Crypto.randomUUID();
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  body?: unknown;
  query?: Query;
  /** Required for every mutating call; generate once per user action. */
  idempotencyKey?: string;
  /** Attach the Clerk bearer token (default true; false for /public/**). */
  auth?: boolean;
  signal?: AbortSignal;
  /** Extra request headers (e.g. `X-App-Version`). Never overrides auth or idempotency. */
  headers?: Record<string, string>;
}

export function buildUrl(base: string, path: string, query?: Query) {
  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(
          ([k, v]) =>
            `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
        )
        .join('&')
    : '';
  return `${base}${path}${qs ? `?${qs}` : ''}`;
}

/** Parses the `{ data }` / `{ error }` envelope into data or an ApiError. */
export async function parseEnvelope<T>(res: Response): Promise<T> {
  const headerRequestId = res.headers?.get?.('x-request-id') ?? null;
  let json: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (res.ok) {
    if (json && typeof json === 'object' && 'data' in json) {
      return (json as { data: T }).data;
    }
    if (res.status === 204 || !text) return undefined as T;
    throw new ApiError({
      code: 'BAD_RESPONSE',
      message: 'The server returned an unexpected response.',
      status: res.status,
      requestId: headerRequestId,
    });
  }

  const body = json as Partial<ApiErrorBody> | null;
  if (body && body.error && typeof body.error.code === 'string') {
    throw new ApiError({
      code: body.error.code,
      message: body.error.message || 'Request failed',
      status: res.status,
      requestId: body.error.request_id ?? headerRequestId,
      details: body.error.details,
    });
  }
  throw new ApiError({
    code: res.status >= 500 ? 'INTERNAL' : 'BAD_RESPONSE',
    message: `Request failed (${res.status})`,
    status: res.status,
    requestId: headerRequestId,
  });
}

export async function apiRequest<T>(
  method: Method,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  if (!env.apiUrl) {
    throw new ApiError({
      code: 'NOT_CONFIGURED',
      message: 'EXPO_PUBLIC_API_URL is not set.',
      status: 0,
    });
  }
  const headers: Record<string, string> = {
    ...opts.headers,
    Accept: 'application/json',
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    if (!opts.idempotencyKey) {
      // Programming error: every mutation needs a key minted per user action.
      throw new Error(`Missing Idempotency-Key for ${method} ${path}`);
    }
    headers['Idempotency-Key'] = opts.idempotencyKey;
  }
  if (opts.auth !== false) {
    const token = await getSessionToken();
    // Never send a protected call without a token: it can only 401, and a
    // caller that reads that as "no business" misroutes the user.
    if (!token) {
      throw new ApiError({
        code: 'NOT_SIGNED_IN',
        message: 'No session token is available yet.',
        status: 401,
      });
    }
    headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(buildUrl(env.apiUrl, path, opts.query), {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ApiError({
      code: 'NETWORK_ERROR',
      message: 'Could not reach the server. Check your connection.',
      status: 0,
    });
  }
  return parseEnvelope<T>(res);
}

export const get = <T>(path: string, query?: Query, auth = true) =>
  apiRequest<T>('GET', path, { query, auth });
export const send =
  <B, T>(method: Exclude<Method, 'GET'>, path: string, auth = true) =>
  (body: B, idempotencyKey: string) =>
    apiRequest<T>(method, path, {
      body: body === undefined ? undefined : body,
      idempotencyKey,
      auth,
    });

export const enc = encodeURIComponent;
