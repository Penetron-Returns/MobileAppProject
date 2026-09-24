/**
 * Authenticated admin REST API (docs/BUILD_PLAN.md §4, WS-B table).
 * Mounted at /v1 behind requireAuth() + idempotency(); owner-only routes
 * add requireOwner. Responses are always `{ data }`.
 */
import { Hono } from 'hono';

import type { AppEnv } from '../../types';
import { appointmentRoutes } from './appointments';
import { availabilityRoutes } from './availability';
import { businessRoutes } from './business';
import { catalogRoutes } from './catalog';
import { clientRoutes } from './clients';

export const v1Routes = new Hono<AppEnv>();

v1Routes.route('/', businessRoutes);
v1Routes.route('/', catalogRoutes);
v1Routes.route('/', clientRoutes);
v1Routes.route('/', availabilityRoutes);
v1Routes.route('/', appointmentRoutes);
