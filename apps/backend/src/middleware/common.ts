import { randomUUID } from 'node:crypto';

import type { ErrorHandler, MiddlewareHandler } from 'hono';

import type { ApiErrorBody } from '../../../../packages/shared/api.ts';
import type { Container } from '../container.ts';
import { safeEqual } from '../lib/crypto.ts';
import { AppError } from '../lib/errors.ts';
import { createLogger } from '../lib/logger.ts';
import type { AppEnv } from '../types.ts';

/** Attaches request id, logger and the DI container to every request. */
export function baseContext(getContainer: () => Container): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const incoming = c.req.header('x-request-id');
    const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    c.set('requestId', requestId);
    c.header('x-request-id', requestId);
    const logger = createLogger({ request_id: requestId, method: c.req.method, path: c.req.path });
    c.set('logger', logger);
    c.set('container', getContainer());
    const started = Date.now();
    await next();
    c.get('logger').info('request', { status: c.res.status, duration_ms: Date.now() - started });
  };
}

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  const requestId = c.get('requestId') ?? 'unknown';
  const appError =
    err instanceof AppError ? err : new AppError('INTERNAL', 'Something went wrong. Please try again.');
  if (!(err instanceof AppError) || appError.status >= 500) {
    (c.get('logger') ?? createLogger()).error('unhandled_error', { error: err });
  }
  const body: ApiErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {}),
      request_id: requestId,
    },
  };
  return c.json(body, appError.status as 400);
};

/** Accepts `x-cron-secret: <CRON_SECRET>` (pg_cron via pg_net) or `Authorization: Bearer <CRON_SECRET>`. */
export const requireCronSecret: MiddlewareHandler<AppEnv> = async (c, next) => {
  const secret = c.get('container').env.CRON_SECRET;
  const provided =
    c.req.header('x-cron-secret') ?? c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!secret || !provided || !safeEqual(provided, secret)) {
    throw new AppError('UNAUTHENTICATED', 'Invalid cron secret');
  }
  await next();
};
