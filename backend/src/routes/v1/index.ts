// STUB — WS-B implements the authenticated admin REST API (see docs/BUILD_PLAN.md §4).
// Mounted at /v1 behind requireAuth() + idempotency(). Use requireOwner for owner-only routes.
import { Hono } from 'hono';

import type { AppEnv } from '../../types';

export const v1Routes = new Hono<AppEnv>();
