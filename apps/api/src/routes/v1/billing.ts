/**
 * GET /v1/billing/usage, GET /v1/plans (any member);
 * POST /v1/billing/checkout, POST /v1/billing/portal (owner only, Idempotency-Key enforced by the middleware).
 */
import { Hono } from 'hono';
import { z } from 'zod';

import { requireOwner } from '../../middleware/auth.ts';
import { parseJson, parseQuery } from '../../lib/validation.ts';
import type { AppEnv } from '../../types.ts';
import { monthQuerySchema } from './schemas.ts';

export const billingRoutes = new Hono<AppEnv>();

billingRoutes.get('/billing/usage', async (c) => {
  const { month } = parseQuery(c, monthQuerySchema);
  return c.json({ data: await c.get('container').usage.getUsage(c.get('auth').businessId, month) });
});

billingRoutes.get('/plans', async (c) => c.json({ data: await c.get('container').usage.listPlans(c.get('auth').businessId) }));

const CheckoutSchema = z.object({ plan: z.enum(['starter', 'growth', 'pro']) }).strict();

billingRoutes.post('/billing/checkout', requireOwner, async (c) => {
  const { plan } = await parseJson(c, CheckoutSchema);
  const checkout = await c.get('container').billing.createCheckout({
    businessId: c.get('auth').businessId,
    actorId: c.get('auth').userId,
    plan,
    idempotencyKey: c.req.header('Idempotency-Key') ?? '',
  });
  return c.json({ data: checkout }, 201);
});

billingRoutes.post('/billing/plan', requireOwner, async (c) => {
  const { plan } = await parseJson(c, CheckoutSchema);
  const subscription = await c.get('container').billing.changePlan({
    businessId: c.get('auth').businessId,
    actorId: c.get('auth').userId,
    plan,
    idempotencyKey: c.req.header('Idempotency-Key') ?? '',
  });
  return c.json({ data: subscription });
});

billingRoutes.post('/billing/portal', requireOwner, async (c) =>
  c.json({ data: await c.get('container').billing.createPortal(c.get('auth').businessId) }, 201),
);
