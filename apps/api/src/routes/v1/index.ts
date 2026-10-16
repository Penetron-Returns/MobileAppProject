/**
 * Authenticated admin REST API (docs/BUILD_PLAN.md §4, WS-B table).
 * Mounted at /v1 behind requireAuth() + idempotency(); owner-only routes
 * add requireOwner. Responses are always `{ data }`.
 */
import { Hono } from 'hono';

import type { AppEnv } from '../../types.ts';
import { appointmentRoutes } from './appointments.ts';
import { availabilityRoutes } from './availability.ts';
import { billingRoutes } from './billing.ts';
import { businessRoutes } from './business.ts';
import { catalogRoutes } from './catalog.ts';
import { clientRoutes } from './clients.ts';
import { companionRoutes } from './companion.ts';
import { reportsRoutes } from './reports.ts';
import { scheduleRoutes } from './schedule.ts';
import { teamRoutes } from './team.ts';
import { voiceRoutes } from './voice.ts';

export const v1Routes = new Hono<AppEnv>();

v1Routes.route('/', businessRoutes);
v1Routes.route('/', catalogRoutes);
v1Routes.route('/', clientRoutes);
v1Routes.route('/', availabilityRoutes);
v1Routes.route('/', scheduleRoutes);
v1Routes.route('/', appointmentRoutes);
v1Routes.route('/', teamRoutes);
v1Routes.route('/', billingRoutes);
v1Routes.route('/', companionRoutes);
v1Routes.route('/', reportsRoutes);
v1Routes.route('/', voiceRoutes);
