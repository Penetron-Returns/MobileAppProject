/**
 * POST /public/billing/checkout/confirm: called by our checkout page the moment Stripe reports the payment complete.
 * No auth: the Checkout Session id (a Stripe-issued secret the payer holds) is the capability, and the answer carries
 * no PII. It re-verifies the session with Stripe, so a forged id can only ever confirm a payment that really happened.
 * CORS is an allowlist (CHECKOUT_ALLOWED_ORIGINS), not the wildcard of the other public routes.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';

import { checkoutAllowedOrigins } from '@booking/features/billing/lib/config.ts';
import { parseJson } from '../lib/validation.ts';
import type { AppEnv } from '../types.ts';

export const CHECKOUT_CONFIRM_PATH = '/public/billing/checkout/confirm';

export const checkoutConfirmCors = cors({
  origin: (origin, c) => (checkoutAllowedOrigins(c.get('container').env).includes(origin) ? origin : null),
  allowMethods: ['POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: 600,
});

const ConfirmSchema = z.object({ session_id: z.string().regex(/^cs_(test|live)_[A-Za-z0-9]+$/) }).strict();

export const publicBillingRoutes = new Hono<AppEnv>();

publicBillingRoutes.post('/checkout/confirm', async (c) => {
  const { session_id } = await parseJson(c, ConfirmSchema);
  const result = await c.get('container').billing.confirmCheckout(session_id);
  // `status`/`plan` at the top level (the checkout page's contract) and under `data` (the API's usual envelope).
  return c.json({ ...result, data: result });
});
