import type { Context } from 'hono';
import type { z } from 'zod';

import { getBookingRepository } from '@booking/features/bookings/index.ts';
import { AppError } from '@booking/features/lib/errors.ts';
import { parseJson, parseParam } from '../../lib/validation.ts';
import type { Actor } from '@booking/features/ports.ts';
import type { AppEnv } from '../../types.ts';
import { uuid } from './schemas.ts';

export type Ctx = Context<AppEnv>;

/** Per-request handles: repository, booking service and the caller. */
export function deps(c: Ctx) {
  const container = c.get('container');
  const auth = c.get('auth');
  /** Owner/staff acting through the app. Audit identity is passed into RPCs as p_actor_id. */
  const actor: Actor = { type: 'staff', id: auth.userId };
  return { repo: getBookingRepository(container), booking: container.booking, auth, actor };
}

export const idParam = (c: Ctx, name = 'id') => parseParam(c, name, uuid);

/** Like parseJson, but an empty body is treated as `{}` (for optional-body POSTs). */
export async function parseOptionalJson<S extends z.ZodType>(c: Ctx, schema: S): Promise<z.infer<S>> {
  const raw = await c.req.text();
  if (raw.trim() !== '') return parseJson(c, schema);
  const result = schema.safeParse({});
  if (!result.success) throw new AppError('VALIDATION_FAILED', 'Request body is required');
  return result.data;
}

/** Namespaced Idempotency-Key for the create_appointment RPC. */
export function rpcIdempotencyKey(c: Ctx, namespace: 'app' | 'web'): string {
  const key = c.req.header('idempotency-key');
  if (!key) throw new AppError('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
  return `${namespace}:${key}`;
}
