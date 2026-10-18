import { describe, expect, it } from 'vitest';

import { signStripePayload } from '@booking/features/billing/lib/stripeSignature.ts';
import { billingConfigFromEnv, checkoutAllowedOrigins } from '@booking/features/billing/lib/config.ts';
import type { BillingAuditEntry, BillingConfig } from '@booking/features/billing/ports.ts';
import { createBillingService } from '@booking/features/billing/services/billingService.ts';
import { createStripeHttpClient } from '@booking/features/billing/services/stripeHttpClient.ts';
import { createUsageService } from '@booking/features/plans/services/usage.ts';
import { createFakeStripe, createMemoryBillingRepository } from '@booking/testing/billing.ts';
import { createMemoryRepository } from '@booking/testing/bookingMemoryRepository.ts';
import type { Container } from '../../src/container.ts';
import { BIZ, NOW, plansHarness } from '../plans/harness.ts';

const PAGE = 'https://checkout.getclovie.app';
const SECRET = 'whsec_test_secret';
const CONFIG: BillingConfig = {
  prices: { starter: { ZAR: 'price_starter' }, growth: { ZAR: 'price_growth' }, pro: { ZAR: 'price_pro' } },
  usagePrices: { starter: { ZAR: 'price_starter_usage' }, growth: { ZAR: 'price_growth_usage' }, pro: { ZAR: 'price_pro_usage' } },
  meterEventName: 'booking_made',
  successUrl: 'clovie://billing/success',
  cancelUrl: 'clovie://billing/cancel',
  returnUrl: 'clovie://billing/return',
};
const nowSec = Math.floor(NOW.getTime() / 1000);

function setup(opts: { page?: boolean } = {}) {
  const stripe = createFakeStripe();
  const repo = createMemoryBillingRepository({ [BIZ]: { plan: 'none', name: 'Salon & Spa', email: 'owner@example.test' } });
  const audits: BillingAuditEntry[] = [];
  const h = plansHarness({
    plan: 'none',
    env: { STRIPE_WEBHOOK_SECRET: SECRET, ...(opts.page === false ? {} : { CHECKOUT_PAGE_URL: PAGE }) },
    overrides: { bookingRepository: createMemoryRepository({ now: () => NOW }) } as Partial<Container>,
  });
  const billing = createBillingService({
    stripe,
    config: { ...CONFIG, ...(opts.page === false ? {} : { checkoutPageUrl: PAGE }) },
    repo,
    audit: { record: async (entry) => void audits.push(entry) },
    events: { accountChanged: async () => undefined },
    defer: (task) => void task(),
    clock: () => NOW,
  });
  const container = h.container as { billing: unknown; usage: unknown };
  container.billing = billing;
  container.usage = createUsageService({ repo: h.plans, clock: () => NOW, billing });

  const confirm = async (session_id: string, origin?: string) => {
    const res = await h.app.request('/public/billing/checkout/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
      body: JSON.stringify({ session_id }),
    });
    return { status: res.status, body: (await res.json()) as any, headers: res.headers };
  };
  const webhook = async (type: string, object: Record<string, unknown>, id: string) => {
    const raw = JSON.stringify({ id, type, created: nowSec, data: { object } });
    const res = await h.app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': signStripePayload(SECRET, raw, nowSec) },
      body: raw,
    });
    return res.status;
  };
  const checkout = async (body: Record<string, unknown> = { plan: 'growth' }, key?: string) =>
    h.call('POST', '/v1/billing/checkout', { body, ...(key ? { key } : {}) });
  /** "Pays" the session: it completes with a live subscription */
  const pay = (sessionId: string, paymentStatus: 'paid' | 'unpaid' = 'paid') => {
    const session = stripe.checkoutSessions.get(sessionId)!;
    session.status = 'complete';
    session.paymentStatus = paymentStatus;
    session.subscriptionId = 'sub_1';
    stripe.subscriptions.set('sub_1', {
      id: 'sub_1',
      customerId: 'cus_1',
      status: 'active',
      items: [{ id: 'si_base', priceId: 'price_growth' }, { id: 'si_usage', priceId: 'price_growth_usage' }],
      currentPeriodEnd: '2026-11-13T10:00:00.000Z',
      cancelAtPeriodEnd: false,
      businessId: null,
      metadataPlan: 'growth',
    });
  };
  const completedEvent = () => ({ id: 'cs_test_1', mode: 'subscription', client_reference_id: BIZ, customer: 'cus_1', subscription: 'sub_1' });
  return { h, stripe, repo, audits, confirm, webhook, checkout, pay, completedEvent, billing };
}

const oldSub = (status: 'active' | 'trialing' | 'past_due' | 'canceled') => ({
  id: 'sub_x',
  customerId: 'cus_1',
  status,
  items: [],
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  businessId: null,
  metadataPlan: null,
});

describe('embedded checkout session creation', () => {
  it('creates an embedded session and answers a checkout page URL with the session in the fragment', async () => {
    const t = setup();
    const res = await t.checkout({ plan: 'growth', return_url: 'clovie://checkout/done?x=1&y=a b' });
    expect(res.status).toBe(201);
    expect(t.stripe.sessions[0]).toMatchObject({ embedded: true, plan: 'growth', priceId: 'price_growth', usagePriceId: 'price_growth_usage' });
    const url = new URL(res.body.data.checkout_url);
    expect(`${url.origin}${url.pathname}`).toBe(`${PAGE}/`);
    const params = new URLSearchParams(url.hash.slice(1));
    expect(Object.fromEntries(params)).toEqual({
      s: 'cs_test_1',
      cs: 'cs_test_1_secret_abc',
      p: 'growth',
      a: '40000',
      c: 'ZAR',
      b: 'Salon & Spa',
      r: 'clovie://checkout/done?x=1&y=a b',
    });
    expect(res.body.data.session_id).toBe('cs_test_1');
  });

  it('omits r when no return_url is given', async () => {
    const t = setup();
    const res = await t.checkout({ plan: 'starter' });
    const params = new URLSearchParams(new URL(res.body.data.checkout_url).hash.slice(1));
    expect(params.has('r')).toBe(false);
    expect(params.get('a')).toBe('20000');
  });

  it.each(['https://evil.test/checkout', 'clovie://billing/success', 'clovie://checkoutx', 'other://checkout', 'clovie://checkout\n'])(
    'rejects return_url %j with 422 INVALID_RETURN_URL',
    async (return_url) => {
      const t = setup();
      const res = await t.checkout({ plan: 'growth', return_url });
      expect(res.status).toBe(422);
      expect(res.body.error.details?.rule).toBe('INVALID_RETURN_URL');
      expect(t.stripe.sessions).toHaveLength(0);
    },
  );

  it.each(['clovie://checkout', 'clovie-preview://checkout/ok', 'bookingadmin://checkout/a/b?c=d'])('accepts return_url %s', async (return_url) => {
    const t = setup();
    expect((await t.checkout({ plan: 'growth', return_url })).status).toBe(201);
  });

  it('keeps the hosted behaviour when CHECKOUT_PAGE_URL is unset', async () => {
    const t = setup({ page: false });
    const res = await t.checkout({ plan: 'growth' });
    expect(t.stripe.sessions[0]).toMatchObject({ successUrl: CONFIG.successUrl, cancelUrl: CONFIG.cancelUrl });
    expect(t.stripe.sessions[0]?.embedded).toBeFalsy();
    expect(res.body.data.checkout_url).toBe('https://checkout.test/cs_test_1');
  });
});

describe('double payment guard', () => {
  it('expires the other open sessions of the customer so only the new one stays payable', async () => {
    const t = setup();
    await t.checkout({ plan: 'starter' }, 'checkout-key-0001');
    await t.checkout({ plan: 'pro' }, 'checkout-key-0002');
    expect(t.stripe.expired).toEqual(['cs_test_1']);
    expect(t.stripe.checkoutSessions.get('cs_test_1')?.status).toBe('expired');
    expect(t.stripe.checkoutSessions.get('cs_test_2')?.status).toBe('open');
  });

  it('a replayed request key never expires its own session', async () => {
    const t = setup();
    await t.checkout({ plan: 'growth' }, 'checkout-key-0003');
    await t.billing.createCheckout({ businessId: BIZ, actorId: 'u', plan: 'growth', idempotencyKey: 'checkout-key-0003' });
    expect(t.stripe.checkoutSessions.get('cs_test_1')?.status).toBe('open');
  });

  it('refuses with ALREADY_SUBSCRIBED when Stripe shows a live subscription our database has not seen', async () => {
    const t = setup();
    await t.repo.saveCustomer(BIZ, 'cus_1');
    for (const status of ['active', 'trialing', 'past_due'] as const) {
      t.stripe.subscriptions.set('sub_x', oldSub(status));
      const res = await t.checkout();
      expect(res.status).toBe(422);
      expect(res.body.error.details?.rule).toBe('ALREADY_SUBSCRIBED');
    }
    expect(t.stripe.sessions).toHaveLength(0);
  });

  it('allows a new checkout when the customer only has a canceled subscription', async () => {
    const t = setup();
    await t.repo.saveCustomer(BIZ, 'cus_1');
    t.stripe.subscriptions.set('sub_old', oldSub('canceled'));
    expect((await t.checkout()).status).toBe(201);
  });
});

describe('POST /public/billing/checkout/confirm', () => {
  it('activates a paid session at once and audits it', async () => {
    const t = setup();
    await t.checkout();
    t.pay('cs_test_1');
    const res = await t.confirm('cs_test_1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'active', plan: 'growth', data: { status: 'active', plan: 'growth' } });
    expect(t.repo.plans.get(BIZ)).toBe('growth');
    expect(t.audits.filter((a) => a.entity === 'billing_subscription')).toEqual([
      expect.objectContaining({ actorId: '', diff: expect.objectContaining({ source: 'checkout_confirm', ref: 'cs_test_1', plan_from: 'none', plan_to: 'growth' }) }),
    ]);
  });

  it('needs no Idempotency-Key and returns no PII', async () => {
    const t = setup();
    await t.checkout();
    t.pay('cs_test_1');
    const res = await t.confirm('cs_test_1');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/owner@example|Salon|cus_|sub_|@/);
  });

  it('answers processing for a complete but unpaid session and does not activate', async () => {
    const t = setup();
    await t.checkout();
    t.pay('cs_test_1', 'unpaid');
    expect((await t.confirm('cs_test_1')).body.status).toBe('processing');
    expect(t.repo.plans.get(BIZ)).toBe('none');
  });

  it('answers open and expired', async () => {
    const t = setup();
    await t.checkout({ plan: 'starter' }, 'checkout-key-0001');
    expect((await t.confirm('cs_test_1')).body.status).toBe('open');
    await t.checkout({ plan: 'pro' }, 'checkout-key-0002');
    expect((await t.confirm('cs_test_1')).body.status).toBe('expired');
  });

  it('answers 404 for an unknown session and for one that is not ours', async () => {
    const t = setup();
    expect((await t.confirm('cs_test_unknown')).status).toBe(404);
    await t.checkout();
    t.stripe.checkoutSessions.get('cs_test_1')!.businessId = null;
    expect((await t.confirm('cs_test_1')).status).toBe(404);
  });

  it.each(['', 'cs_test_', 'sub_123', 'cs_dev_abc', 'cs_test_a b', 'cs_live_abc/../x'])('rejects session_id %j with 400', async (id) => {
    const t = setup();
    expect((await t.confirm(id)).status).toBe(400);
  });

  it('confirm then webhook: the webhook is a no-op (one plan write, one audit)', async () => {
    const t = setup();
    await t.checkout();
    t.pay('cs_test_1');
    await t.confirm('cs_test_1');
    expect(await t.webhook('checkout.session.completed', t.completedEvent(), 'evt_1')).toBe(200);
    expect(t.repo.planWrites).toHaveLength(1);
    expect(t.audits.filter((a) => a.entity === 'billing_subscription')).toHaveLength(1);
    expect(t.repo.plans.get(BIZ)).toBe('growth');
  });

  it('webhook then confirm: confirm still answers active and changes nothing', async () => {
    const t = setup();
    await t.checkout();
    t.pay('cs_test_1');
    await t.webhook('checkout.session.completed', t.completedEvent(), 'evt_1');
    const res = await t.confirm('cs_test_1');
    expect(res.body).toMatchObject({ status: 'active', plan: 'growth' });
    expect(t.repo.planWrites).toHaveLength(1);
    expect(t.audits.filter((a) => a.entity === 'billing_subscription')).toHaveLength(1);
  });

  it('is repeatable: confirming twice gives the same answer', async () => {
    const t = setup();
    await t.checkout();
    t.pay('cs_test_1');
    const first = await t.confirm('cs_test_1');
    const second = await t.confirm('cs_test_1');
    expect(second.body).toEqual(first.body);
    expect(t.repo.planWrites).toHaveLength(1);
  });
});

describe('confirm route CORS', () => {
  const preflight = (t: ReturnType<typeof setup>, origin: string) =>
    t.h.app.request('/public/billing/checkout/confirm', {
      method: 'OPTIONS',
      headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
    });

  it('answers the preflight for allowed origins only, with POST/OPTIONS and content-type', async () => {
    const t = setup();
    const ok = await preflight(t, PAGE);
    expect(ok.headers.get('access-control-allow-origin')).toBe(PAGE);
    expect(ok.headers.get('access-control-allow-methods')).toBe('POST,OPTIONS');
    expect(ok.headers.get('access-control-allow-headers')).toBe('Content-Type');
    expect((await preflight(t, 'http://localhost:3000')).headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    expect((await preflight(t, 'https://evil.test')).headers.get('access-control-allow-origin')).toBeNull();
  });

  it('does not send the wildcard on the real response', async () => {
    const t = setup();
    await t.checkout();
    t.pay('cs_test_1');
    expect((await t.confirm('cs_test_1', PAGE)).headers.get('access-control-allow-origin')).toBe(PAGE);
    expect((await t.confirm('cs_test_1', 'https://evil.test')).headers.get('access-control-allow-origin')).toBeNull();
  });

  it('derives the allowlist from env', () => {
    expect(checkoutAllowedOrigins({ CHECKOUT_PAGE_URL: `${PAGE}/` })).toEqual([PAGE, 'http://localhost:3000']);
    expect(checkoutAllowedOrigins({ CHECKOUT_PAGE_URL: PAGE, CHECKOUT_ALLOWED_ORIGINS: 'https://a.test, https://b.test/x' })).toEqual(['https://a.test', 'https://b.test']);
  });
});

describe('billingConfigFromEnv with the checkout page', () => {
  it('is enabled by CHECKOUT_PAGE_URL alone and strips the trailing slash', () => {
    expect(billingConfigFromEnv({ CHECKOUT_PAGE_URL: `${PAGE}/` })?.checkoutPageUrl).toBe(PAGE);
    expect(billingConfigFromEnv({})).toBeNull();
  });
});

describe('Stripe HTTP client: embedded session', () => {
  it('sends embedded_page, redirect_on_completion never, branding and no redirect urls', async () => {
    const calls: { url: string; body: string }[] = [];
    const stripe = createStripeHttpClient({
      secretKey: 'sk_test',
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, body: String(init.body ?? '') });
        return new Response(JSON.stringify({ id: 'cs_test_1', client_secret: 'cs_test_1_secret_x' }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    const out = await stripe.createCheckoutSession({ customerId: 'cus_1', priceId: 'p', usagePriceId: 'u', businessId: BIZ, plan: 'pro', successUrl: '', cancelUrl: '', embedded: true, idempotencyKey: 'k' });
    expect(out).toEqual({ id: 'cs_test_1', url: null, clientSecret: 'cs_test_1_secret_x' });
    const form = new URLSearchParams(calls[0]!.body);
    expect(form.get('ui_mode')).toBe('embedded_page');
    expect(form.get('redirect_on_completion')).toBe('never');
    expect(form.get('branding_settings[button_color]')).toBe('#0A69DB');
    expect(form.get('branding_settings[font_family]')).toBe('inter');
    expect(form.get('branding_settings[border_style]')).toBe('rounded');
    expect(form.has('success_url')).toBe(false);
  });

  it('maps an unknown session to null, and treats expiring a closed session as fine', async () => {
    const statuses = [404, 400];
    const stripe = createStripeHttpClient({
      secretKey: 'sk_test',
      fetch: (async () => new Response(JSON.stringify({ error: { code: 'x' } }), { status: statuses.shift() })) as unknown as typeof fetch,
    });
    expect(await stripe.retrieveCheckoutSession('cs_test_nope')).toBeNull();
    await expect(stripe.expireCheckoutSession('cs_test_done')).resolves.toBeUndefined();
  });
});
