import { verifyToken } from '@clerk/backend';
import type { MiddlewareHandler } from 'hono';

import type { MemberRole } from '../../../shared/api';
import { AppError } from '../lib/errors';
import type { AppEnv } from '../types';

export interface ClerkClaims {
  sub: string;
  /** Clerk session token v1 */
  org_id?: string;
  org_role?: string;
  /** Clerk session token v2 */
  o?: { id?: string; rol?: string; slg?: string };
}

export function orgFromClaims(claims: ClerkClaims): { orgId: string | null; role: MemberRole } {
  const orgId = claims.org_id ?? claims.o?.id ?? null;
  const rawRole = (claims.org_role ?? claims.o?.rol ?? '').replace(/^org:/, '');
  const role: MemberRole = rawRole === 'admin' || rawRole === 'owner' ? 'owner' : 'staff';
  return { orgId, role };
}

// org id → business id, cached per warm instance (orgs are immutable once linked)
const businessByOrg = new Map<string, { id: string; at: number }>();
const BUSINESS_CACHE_MS = 5 * 60_000;

/** Verifies the Clerk session JWT and resolves the caller's business. */
export function requireAuth(
  verify: (token: string) => Promise<ClerkClaims> = defaultVerifier,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new AppError('UNAUTHENTICATED', 'Missing bearer token');

    let claims: ClerkClaims;
    try {
      claims = await verify(token);
    } catch {
      throw new AppError('UNAUTHENTICATED', 'Invalid or expired session token');
    }

    const { orgId, role } = orgFromClaims(claims);
    if (!orgId) throw new AppError('NO_BUSINESS', 'No active organisation on this session');

    let businessId = businessByOrg.get(orgId);
    if (!businessId || Date.now() - businessId.at > BUSINESS_CACHE_MS) {
      const { db } = c.get('container');
      const { data, error } = await db.from('businesses').select('id').eq('clerk_org_id', orgId).maybeSingle();
      if (error) throw new AppError('INTERNAL', 'Failed to resolve business');
      if (!data) throw new AppError('NO_BUSINESS', 'Organisation is not linked to a business');
      businessId = { id: data.id as string, at: Date.now() };
      businessByOrg.set(orgId, businessId);
    }

    c.set('auth', { userId: claims.sub, orgId, role, businessId: businessId.id });
    c.set('logger', c.get('logger').child({ business_id: businessId.id, user_id: claims.sub }));
    await next();
  };
}

export const requireOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('auth').role !== 'owner') throw new AppError('FORBIDDEN', 'Owner role required');
  await next();
};

async function defaultVerifier(token: string): Promise<ClerkClaims> {
  const jwtKey = process.env.CLERK_JWT_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;
  const parties = process.env.CLERK_AUTHORIZED_PARTIES?.split(',').map((s) => s.trim()).filter(Boolean);
  const payload = await verifyToken(token, {
    ...(jwtKey ? { jwtKey } : { secretKey }),
    ...(parties && parties.length ? { authorizedParties: parties } : {}),
  });
  return payload as unknown as ClerkClaims;
}
