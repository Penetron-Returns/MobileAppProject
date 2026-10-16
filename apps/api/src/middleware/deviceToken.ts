import type { MiddlewareHandler } from 'hono';

import { AppError } from '@booking/features/lib/errors.ts';
import { isDeviceToken } from '@booking/features/voice/deviceTokens.ts';
import type { AppEnv } from '../types.ts';

/**
 * The only routes a device voice token may call (method + exact path; the Edge Function mounts the app
 * under `/api`). Everything else needs the Clerk session.
 */
const DEVICE_TOKEN_ROUTES: readonly { method: string; path: RegExp }[] = [
  { method: 'POST', path: /^(\/api)?\/v1\/voice\/transcriptions$/ },
  { method: 'POST', path: /^(\/api)?\/v1\/attendance\/[^/]+\/answer$/ },
  { method: 'POST', path: /^(\/api)?\/v1\/appointments\/[^/]+\/check-in$/ },
  { method: 'GET', path: /^(\/api)?\/v1\/voice\/today$/ },
];

export function isDeviceTokenRoute(method: string, path: string): boolean {
  return DEVICE_TOKEN_ROUTES.some((r) => r.method === method && r.path.test(path));
}

function bearer(header: string | undefined): string {
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

/**
 * Wraps the Clerk `requireAuth`: a bearer starting with `cvt_` is authenticated against the stored token
 * hash (revocation and the member's continued membership re-checked on every call) and sets the same auth
 * context, but only on {@link DEVICE_TOKEN_ROUTES}. On any other route it is refused outright. Any other bearer
 * goes to `clerkAuth` untouched. The token itself is never logged.
 */
export function allowDeviceToken(clerkAuth: MiddlewareHandler<AppEnv>): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = bearer(c.req.header('authorization'));
    if (!isDeviceToken(token)) return clerkAuth(c, next);

    if (!isDeviceTokenRoute(c.req.method, c.req.path)) {
      c.get('logger')?.warn('auth_rejected', { reason: 'device_token_out_of_scope' });
      throw new AppError('UNAUTHENTICATED', 'This credential cannot be used here');
    }
    const identity = await c.get('container').voiceTokens.authenticate(token);
    if (!identity) {
      c.get('logger')?.warn('auth_rejected', { reason: 'device_token_invalid' });
      throw new AppError('UNAUTHENTICATED', 'Invalid or revoked device token');
    }
    c.set('auth', { userId: identity.userId, orgId: identity.orgId, role: identity.role, businessId: identity.businessId });
    c.set('logger', c.get('logger').child({ business_id: identity.businessId, user_id: identity.userId, auth: 'device_token' }));
    await next();
  };
}
