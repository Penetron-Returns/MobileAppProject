import type { MiddlewareHandler } from 'hono';

import type { Json } from '../../../shared/database.types.ts';
import { sha256Hex } from '../lib/crypto.ts';
import { AppError } from '../lib/errors.ts';
import type { AppEnv } from '../types.ts';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const KEY_RE = /^[A-Za-z0-9_\-:.]{8,200}$/;

export interface IdempotencyRecord {
  key: string;
  business_id: string | null;
  endpoint: string;
  request_hash: string;
  status_code: number | null;
  response: unknown;
}

/** Storage port so the middleware is testable without a database. */
export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | null>;
  /** Inserts a pending record; returns false if the key already exists. */
  reserve(record: Omit<IdempotencyRecord, 'status_code' | 'response'>): Promise<boolean>;
  complete(key: string, statusCode: number, response: unknown): Promise<void>;
  release(key: string): Promise<void>;
}

export function supabaseIdempotencyStore(c: { get: (k: 'container') => AppEnv['Variables']['container'] }): IdempotencyStore {
  const db = () => c.get('container').db;
  return {
    async get(key) {
      const { data, error } = await db().from('idempotency_keys').select('*').eq('key', key).maybeSingle();
      if (error) throw new AppError('INTERNAL', 'Idempotency lookup failed');
      return (data as IdempotencyRecord | null) ?? null;
    },
    async reserve(record) {
      const { error } = await db().from('idempotency_keys').insert(record);
      if (!error) return true;
      if (error.code === '23505') return false;
      throw new AppError('INTERNAL', 'Idempotency reserve failed');
    },
    async complete(key, statusCode, response) {
      await db().from('idempotency_keys').update({ status_code: statusCode, response: response as Json }).eq('key', key);
    },
    async release(key) {
      await db().from('idempotency_keys').delete().eq('key', key);
    },
  };
}

/**
 * Enforces `Idempotency-Key` on mutating requests and replays stored responses.
 * Same key + same request → identical stored response (incl. 4xx).
 * Same key + different request → 422 IDEMPOTENCY_KEY_REUSED.
 * 5xx responses are not stored so the client may retry.
 */
export function idempotency(
  storeFactory: (c: Parameters<MiddlewareHandler<AppEnv>>[0]) => IdempotencyStore = supabaseIdempotencyStore,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!MUTATING.has(c.req.method)) return next();

    const key = c.req.header('idempotency-key');
    if (!key) throw new AppError('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
    if (!KEY_RE.test(key)) throw new AppError('VALIDATION_FAILED', 'Malformed Idempotency-Key');

    const store = storeFactory(c);
    const endpoint = `${c.req.method} ${c.req.path}`;
    const body = await c.req.text();
    const requestHash = sha256Hex(`${endpoint}\n${body}`);
    const businessId = c.get('auth')?.businessId ?? null;

    const existing = await store.get(key);
    if (existing) return replay(existing);

    const reserved = await store.reserve({ key, business_id: businessId, endpoint, request_hash: requestHash });
    if (!reserved) {
      const raced = await store.get(key);
      if (raced) return replay(raced);
    }

    try {
      await next();
    } catch (err) {
      await store.release(key);
      throw err;
    }

    const status = c.res.status;
    if (status >= 500) {
      await store.release(key);
      return;
    }
    let payload: unknown = null;
    try {
      payload = await c.res.clone().json();
    } catch {
      payload = null;
    }
    await store.complete(key, status, payload);

    function replay(record: IdempotencyRecord) {
      if (record.request_hash !== requestHash || record.business_id !== businessId) {
        throw new AppError('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key was already used for a different request');
      }
      if (record.status_code === null) {
        throw new AppError('IDEMPOTENCY_KEY_REUSED', 'A request with this Idempotency-Key is still in progress', {
          in_progress: true,
        });
      }
      c.header('idempotent-replay', 'true');
      return c.json(record.response as object, record.status_code as 200);
    }
  };
}
