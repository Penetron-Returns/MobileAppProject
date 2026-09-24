import type { MemberRole, UUID } from '../../shared/api';
import type { Container } from './container';
import type { Logger } from './lib/logger';

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
  };
}
