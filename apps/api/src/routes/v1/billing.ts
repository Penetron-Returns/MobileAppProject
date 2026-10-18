/**
 * GET /v1/billing/usage, GET /v1/plans (any member);
 * GET /v1/billing/plan/preview (owner only, read-only);
 * POST /v1/billing/checkout, POST /v1/billing/plan, POST /v1/billing/portal (owner only, Idempotency-Key enforced by the middleware).
 */
import { Hono } from 'hono';
import { z } from 'zod';

import { ruleViolation } from '@booking/features/lib/errors.ts';
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

const PlanSchema = z.object({ plan: z.enum(['starter', 'growth', 'pro']) }).strict();

/** The app's deep link back from the checkout page: only our own schemes, only the checkout path. */
export const CHECKOUT_RETURN_URL_RE = /^(clovie|clovie-preview|bookingadmin):\/\/checkout(\/.*)?$/;
const CheckoutSchema = PlanSchema.extend({ return_url: z.string().max(2048).optional() }).strict();

billingRoutes.post('/billing/checkout', requireOwner, async (c) => {
  const { plan, return_url } = await parseJson(c, CheckoutSchema);
  // A well-formed but foreign URL is a rule violation (422), not a malformed body.
  if (return_url !== undefined && !CHECKOUT_RETURN_URL_RE.test(return_url)) {
    throw ruleViolation('INVALID_RETURN_URL', 'return_url must be a clovie://checkout deep link');
  }
  const checkout = await c.get('container').billing.createCheckout({
    businessId: c.get('auth').businessId,
    actorId: c.get('auth').userId,
    plan,
    idempotencyKey: c.req.header('Idempotency-Key') ?? '',
    ...(return_url && { returnUrl: return_url }),
  });
  return c.json({ data: checkout }, 201);
});

const ChangePlanSchema = PlanSchema.extend({ proration_date: z.number().int().positive().optional() }).strict();

/** GET, not POST: it changes nothing, so it needs no Idempotency-Key (the middleware requires one on every POST). */
billingRoutes.get('/billing/plan/preview', requireOwner, async (c) => {
  const { plan } = parseQuery(c, PlanSchema);
  return c.json({ data: await c.get('container').billing.previewPlanChange({ businessId: c.get('auth').businessId, plan }) });
});

billingRoutes.post('/billing/plan', requireOwner, async (c) => {
  const { plan, proration_date } = await parseJson(c, ChangePlanSchema);
  const result = await c.get('container').billing.changePlan({
    businessId: c.get('auth').businessId,
    actorId: c.get('auth').userId,
    plan,
    idempotencyKey: c.req.header('Idempotency-Key') ?? '',
    ...(proration_date !== undefined && { prorationDate: proration_date }),
  });
  return c.json({ data: result });
});

billingRoutes.post('/billing/portal', requireOwner, async (c) =>
  c.json({ data: await c.get('container').billing.createPortal(c.get('auth').businessId) }, 201),
);
