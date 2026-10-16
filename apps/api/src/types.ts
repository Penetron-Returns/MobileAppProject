import type { MemberRole, UUID } from '@booking/types';
import type { Container } from './container.ts';
import type { Logger } from '@booking/features/lib/logger.ts';

export interface AuthContext {
  userId: string;
  orgId: string;
  role: MemberRole;
  businessId: UUID;
}

/** Hono environment shared by every route module. */
export interface AppEnv {
  Variables: {
    requestId: string;
    logger: Logger;
    container: Container;
    /** Set by requireAuth() on /v1/** */
    auth: AuthContext;
    /** Milliseconds the device-token credential check took (set by allowDeviceToken; reported as Server-Timing auth) */
    authMs: number;
    /** Set by requireOrgOwnerSession() on /v1/onboarding (no business yet) */
    session: { userId: string; orgId: string };
  };
}
