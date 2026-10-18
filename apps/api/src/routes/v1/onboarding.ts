/**
 * POST /v1/onboarding: creates the caller's business from the verified Clerk
 * org (see requireOrgOwnerSession) and applies the first hours, services and
 * team. Mounted in app.ts before the business-requiring /v1 auth.
 */
import { Hono } from 'hono';

import { getMe } from '@booking/features/catalog/services/catalog.ts';
import { getBookingRepository } from '@booking/features/bookings/index.ts';
import { completeOnboarding } from '@booking/features/onboarding/services/onboarding.ts';
import { parseJson } from '../../lib/validation.ts';
import type { AppEnv } from '../../types.ts';
import { onboardingSchema } from './schemas.ts';

export const onboardingRoutes = new Hono<AppEnv>();

onboardingRoutes.post('/', async (c) => {
  const container = c.get('container');
  const session = c.get('session');
  const repo = getBookingRepository(container);
  const body = await parseJson(c, onboardingSchema);
  const business = await completeOnboarding(repo, session, body, async (id) => (await container.entitlements.getEntitlements(id)).plan);
  const entitlements = await container.entitlements.getEntitlements(business.id);
  const me = await getMe(repo, { userId: session.userId, businessId: business.id, role: 'owner' }, entitlements);
  c.get('logger').info('onboarding_completed', { business_id: business.id, user_id: session.userId });
  return c.json({ data: me });
});
