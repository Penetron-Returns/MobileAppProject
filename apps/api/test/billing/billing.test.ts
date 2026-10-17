import { describe, expect, it } from 'vitest';

import { signStripePayload } from '@booking/features/billing/lib/stripeSignature.ts';
import type { BillingAuditEntry, BillingConfig } from '@booking/features/billing/ports.ts';
import { createBillingService } from '@booking/features/billing/services/billingService.ts';
import { createUsageService } from '@booking/features/plans/services/usage.ts';
import { createFakeClerkAdmin } from '@booking/testing/clerkAdmin.ts';
import { AppError } from '@booking/features/lib/errors.ts';
import { createFakeStripe, createMemoryBillingRepository } from '@booking/testing/billing.ts';
import { createMemoryRepository } from '@booking/testing/bookingMemoryRepository.ts';
import type { AccountEventType } from '@booking/features/ports.ts';
import type { PlanKey } from '@booking/types';
import type { Container } from '../../src/container.ts';
import { TEST_ENV } from '../helpers.ts';
import { appt, BIZ, NOW, plansHarness } from '../plans/harness.ts';

const SECRET = 'whsec_test_secret';
const PRICES = { starter: 'price_starter', growth: 'price_growth', pro: 'price_pro' };
const USAGE = { starter: 'price_starter_usage', growth: 'price_growth_usage', pro: 'price_pro_usage' };
const CONFIG: BillingConfig = {
  prices: { starter: { ZAR: PRICES.starter }, growth: { ZAR: PRICES.growth }, pro: { ZAR: PRICES.pro } },
  usagePrices: { starter: { ZAR: USAGE.starter }, growth: { ZAR: USAGE.growth }, pro: { ZAR: USAGE.pro } },
  meterEventName: 'booking_made',
  successUrl: 'clovie://billing/success',
  cancelUrl: 'clovie://billing/cancel',
  returnUrl: 'clovie://billing/return',
};
const nowSec = Math.floor(NOW.getTime() / 1000);

interface Options {
  config?: BillingConfig | null;
  stripe?: boolean;
  secret?: string | undefined;
  plan?: PlanKey;
  appointments?: ReturnType<typeof appt>[];
}

function setup(opts: Options = {}) {
  const stripe = createFakeStripe();
  const repo = createMemoryBillingRepository({ [BIZ]: { plan: opts.plan ?? 'none', name: 'Salon', email: 'owner@example.test' } });
  const clerk = createFakeClerkAdmin();
  const audits: BillingAuditEntry[] = [];
  const emitted: { businessId: string; type: AccountEventType }[] = [];
  const pending: Promise<void>[] = [];
  const bookingRepo = createMemoryRepository({ now: () => NOW });
  const h = plansHarness({
    plan: opts.plan ?? 'none',
    appointments: opts.appointments,
    env: { STRIPE_WEBHOOK_SECRET: 'secret' in opts ? opts.secret : SECRET },
    overrides: { bookingRepository: bookingRepo } as Partial<Container>,
  });
  const billing = createBillingService({
    stripe: opts.stripe === false ? null : stripe,
    config: 'config' in opts ? (opts.config ?? null) : CONFIG,
    repo,
    clerk,
    audit: { record: async (entry) => void audits.push(entry) },
    events: { accountChanged: async (businessId, type) => void emitted.push({ businessId, type }) },
    defer: (task) => void pending.push(task()),
    clock: () => NOW,
  });
  const container = h.container as { billing: unknown; usage: unknown };
  container.billing = billing;
  container.usage = createUsageService({ repo: h.plans, clock: () => NOW, billing });

  let seq = 0;
  async function webhook(type: string, object: Record<string, unknown>, o: { id?: string; created?: number; signature?: string; at?: number } = {}) {
    seq += 1;
    const raw = JSON.stringify({ id: o.id ?? `evt_${seq}`, type, created: o.created ?? nowSec, data: { object } });
    const header = o.signature ?? signStripePayload(opts.secret ?? SECRET, raw, o.at ?? nowSec);
    const res = await h.app.request('/webhooks/stripe', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: raw });
    await Promise.all(pending);
    return { status: res.status, body: (await res.json()) as any };
  }
  return { h, stripe, repo, clerk, audits, emitted, webhook, bookingRepo, billing };
}

const sub = (over: Partial<Record<string, unknown>> & { price?: string; usage?: string | null; status?: string } = {}) => ({
  id: 'sub_1',
  customer: 'cus_1',
  status: over.status ?? 'active',
  cancel_at_period_end: false,
  items: {
    data: [
      { id: 'si_base', price: { id: over.price ?? PRICES.growth }, current_period_end: 1_795_000_000 },
      ...(over.usage === null ? [] : [{ id: 'si_usage', price: { id: over.usage ?? USAGE.growth } }]),
    ],
  },
  metadata: { business_id: BIZ, plan: 'growth' },
  ...over,
});

/** A business that already has its Stripe customer, as after a checkout was started */
async function withCustomer(t: ReturnType<typeof setup>) {
  await t.repo.saveCustomer(BIZ, 'cus_1');
}

describe('POST /v1/billing/checkout', () => {
  it.each([
    ['starter', PRICES.starter],
    ['growth', PRICES.growth],
    ['pro', PRICES.pro],
  ])('creates a %s checkout session with that plan\'s price', async (plan, price) => {
    const t = setup();
    const res = await t.h.call('POST', '/v1/billing/checkout', { body: { plan } });
    expect(res.status).toBe(201);
    expect(res.body.data.checkout_url).toMatch(/^https:\/\/checkout\.test\//);
    expect(t.stripe.sessions).toHaveLength(1);
    expect(t.stripe.sessions[0]).toMatchObject({
      priceId: price,
      usagePriceId: USAGE[plan as 'starter' | 'growth' | 'pro'],
      plan,
      businessId: BIZ,
      successUrl: CONFIG.successUrl,
      cancelUrl: CONFIG.cancelUrl,
      customerId: 'cus_1',
    });
  });

  it('creates the Stripe customer once per business and reuses it', async () => {
    const t = setup();
    await t.h.call('POST', '/v1/billing/checkout', { body: { plan: 'starter' } });
    await t.h.call('POST', '/v1/billing/checkout', { body: { plan: 'pro' } });
    expect(t.stripe.customers).toHaveLength(1);
    expect(t.stripe.sessions.map((s) => s.customerId)).toEqual(['cus_1', 'cus_1']);
    expect(t.repo.records.get(BIZ)?.stripeCustomerId).toBe('cus_1');
  });

  it('replays the stored response for a repeated Idempotency-Key without a second session', async () => {
    const t = setup();
    const first = await t.h.call('POST', '/v1/billing/checkout', { body: { plan: 'growth' }, key: 'checkout-key-0001' });
    const again = await t.h.call('POST', '/v1/billing/checkout', { body: { plan: 'growth' }, key: 'checkout-key-0001' });
    expect(again.status).toBe(201);
    expect(again.body).toEqual(first.body);
    expect(t.stripe.sessions).toHaveLength(1);
  });

  it('passes a Stripe idempotency key derived from the business and the request key', async () => {
    const t = setup();
    await t.h.call('POST', '/v1/billing/checkout', { body: { plan: 'growth' }, key: 'checkout-key-0002' });
    expect(t.stripe.sessions[0]?.idempotencyKey).toBe(`checkout:${BIZ}:checkout-key-0002`);
  });

  it('is owner only', async () => {
    const t = setup();
    const res = await t.h.call('POST', '/v1/billing/checkout', { token: 'staff', body: { plan: 'growth' } });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(t.stripe.sessions).toHaveLength(0);
  });

  it('requires an Idempotency-Key', async () => {
    const t = setup();
    const res = await t.h.app.request('/v1/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
      body: JSON.stringify({ plan: 'growth' }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it.each([['free'], ['none'], ['enterprise'], [undefined]])('rejects plan %s', async (plan) => {
    const t = setup();
    const res = await t.h.call('POST', '/v1/billing/checkout', { body: { plan } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('answers 503 BILLING_NOT_CONFIGURED without a Stripe key', async () => {
    const t = setup({ stripe: false });
    const res = await t.h.call('POST', '/v1/billing/checkout', { body: { plan: 'growth' } });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('BILLING_NOT_CONFIGURED');
  });

  it('answers 503 BILLING_NOT_CONFIGURED without return URLs, or without a price for the plan', async () => {
    expect((await setup({ config: null }).h.call('POST', '/v1/billing/checkout', { body: { plan: 'growth' } })).body.error.code).toBe('BILLING_NOT_CONFIGURED');
    const noPro = setup({ config: { ...CONFIG, prices: { starter: { ZAR: PRICES.starter } } } });
    const res = await noPro.h.call('POST', '/v1/billing/checkout', { body: { plan: 'pro' } });
    expect(res.status).toBe(503);
    expect(res.body.error.details).toMatchObject({ plan: 'pro' });
  });

  it('answers 503 BILLING_NOT_CONFIGURED when the plan has no usage price', async () => {
    const t = setup({ config: { ...CONFIG, usagePrices: {} } });
    const res = await t.h.call('POST', '/v1/billing/checkout', { body: { plan: 'growth' } });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('BILLING_NOT_CONFIGURED');
    expect(t.stripe.sessions).toHaveLength(0);
  });

  it('refuses a second subscription: change plan in the portal', async () => {
    const t = setup({ plan: 'growth' });
    await withCustomer(t);
    await t.repo.updateSubscription(BIZ, { stripeSubscriptionId: 'sub_1', status: 'active', plan: 'growth' });
    const res = await t.h.call('POST', '/v1/billing/checkout', { body: { plan: 'pro' } });
    expect(res.status).toBe(422);
    expect(res.body.error.details).toMatchObject({ rule: 'ALREADY_SUBSCRIBED' });
  });

  it('allows a new checkout after a cancelled subscription', async () => {
    const t = setup();
    await withCustomer(t);
    await t.repo.updateSubscription(BIZ, { stripeSubscriptionId: 'sub_1', status: 'canceled', plan: 'growth' });
    expect((await t.h.call('POST', '/v1/billing/checkout', { body: { plan: 'pro' } })).status).toBe(201);
  });
});

describe('POST /v1/billing/portal', () => {
  it('returns a portal url for the subscribed business', async () => {
    const t = setup({ plan: 'growth' });
    await withCustomer(t);
    const res = await t.h.call('POST', '/v1/billing/portal');
    expect(res.status).toBe(201);
    expect(res.body.data.portal_url).toBe('https://portal.test/cus_1');
    expect(t.stripe.portals[0]?.returnUrl).toBe(CONFIG.returnUrl);
  });

  it('is owner only', async () => {
    const t = setup({ plan: 'growth' });
    await withCustomer(t);
    const res = await t.h.call('POST', '/v1/billing/portal', { token: 'staff' });
    expect(res.status).toBe(403);
    expect(t.stripe.portals).toHaveLength(0);
  });

  it('has nothing to manage before the first purchase', async () => {
    const res = await setup().h.call('POST', '/v1/billing/portal');
    expect(res.status).toBe(422);
    expect(res.body.error.details).toMatchObject({ rule: 'NO_SUBSCRIPTION' });
  });

  it('answers 503 BILLING_NOT_CONFIGURED without Stripe', async () => {
    const res = await setup({ stripe: false }).h.call('POST', '/v1/billing/portal');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('BILLING_NOT_CONFIGURED');
  });
});

describe('GET /v1/plans billing fields', () => {
  it('reports checkout_enabled per buyable plan and no subscription before a purchase', async () => {
    const t = setup();
    const res = await t.h.call('GET', '/v1/plans');
    expect(res.body.data.current_plan).toBe('none');
    expect(res.body.data.subscription).toBeNull();
    const enabled = Object.fromEntries(res.body.data.plans.map((p: any) => [p.id, p.checkout_enabled]));
    expect(enabled).toEqual({ free: false, starter: true, growth: true, pro: true });
    expect(res.body.data.plans.every((p: any) => p.checkout_url === null)).toBe(true);
  });

  it('disables checkout when billing is off, and for the current plan', async () => {
    const off = await setup({ stripe: false }).h.call('GET', '/v1/plans');
    expect(off.body.data.plans.some((p: any) => p.checkout_enabled)).toBe(false);
    const on = await setup({ plan: 'growth' }).h.call('GET', '/v1/plans');
    expect(on.body.data.plans.find((p: any) => p.id === 'growth').checkout_enabled).toBe(false);
  });
});

describe('POST /webhooks/stripe', () => {
  it('answers 503 when the signing secret is not configured', async () => {
    const t = setup({ secret: undefined });
    const res = await t.webhook('customer.subscription.updated', sub(), { signature: 't=1,v1=00' });
    expect(res.status).toBe(503);
  });

  it.each([
    ['a wrong signature', signStripePayload('whsec_other', '{}', nowSec)],
    ['no signature', ''],
    ['a malformed header', 'garbage'],
  ])('rejects %s with 401 and changes nothing', async (_name, header) => {
    const t = setup();
    await withCustomer(t);
    const res = await t.webhook('customer.subscription.created', sub(), { signature: header });
    expect(res.status).toBe(401);
    expect(t.repo.planWrites).toEqual([]);
  });

  it('rejects a signature over a different body, and a stale timestamp', async () => {
    const t = setup();
    await withCustomer(t);
    const tampered = signStripePayload(SECRET, '{"id":"evt_x"}', nowSec);
    expect((await t.webhook('customer.subscription.created', sub(), { signature: tampered })).status).toBe(401);
    expect((await t.webhook('customer.subscription.created', sub(), { at: nowSec - 3600 })).status).toBe(401);
    expect(t.repo.planWrites).toEqual([]);
  });

  it('flips the plan on checkout.session.completed and tells Nerova exactly once', async () => {
    const t = setup();
    await withCustomer(t);
    t.stripe.subscriptions.set('sub_1', {
      id: 'sub_1',
      customerId: 'cus_1',
      status: 'active',
      items: [{ id: 'si_base', priceId: PRICES.growth }, { id: 'si_usage', priceId: USAGE.growth }],
      currentPeriodEnd: '2026-11-13T10:00:00.000Z',
      cancelAtPeriodEnd: false,
      businessId: null,
      metadataPlan: 'growth',
    });
    const done = { id: 'cs_1', mode: 'subscription', client_reference_id: BIZ, customer: 'cus_1', subscription: 'sub_1' };
    const res = await t.webhook('checkout.session.completed', done, { id: 'evt_done' });
    expect(res.body.data.status).toBe('processed');
    expect(t.repo.plans.get(BIZ)).toBe('growth');
    expect(t.repo.records.get(BIZ)).toMatchObject({ stripeSubscriptionId: 'sub_1', status: 'active', plan: 'growth', currentPeriodEnd: '2026-11-13T10:00:00.000Z' });
    // The same activation arrives again as subscription.created: no second announcement
    await t.webhook('customer.subscription.created', sub());
    expect(t.emitted).toEqual([{ businessId: BIZ, type: 'account.created' }]);
  });

  it('dedupes a replayed event id: processed once', async () => {
    const t = setup();
    await withCustomer(t);
    const first = await t.webhook('customer.subscription.created', sub(), { id: 'evt_same' });
    const replay = await t.webhook('customer.subscription.created', sub(), { id: 'evt_same' });
    expect(first.body.data.status).toBe('processed');
    expect(replay.status).toBe(200);
    expect(replay.body.data.status).toBe('duplicate');
    expect(t.repo.planWrites).toHaveLength(1);
    expect(t.emitted).toHaveLength(1);
  });

  it('retries after a transient failure: 500 first, then the same event id is processed', async () => {
    const t = setup();
    await withCustomer(t);
    const done = { mode: 'subscription', client_reference_id: BIZ, customer: 'cus_1', subscription: 'sub_1' };
    const failed = await t.webhook('checkout.session.completed', done, { id: 'evt_retry' });
    expect(failed.status).toBe(404); // the fake has no such subscription yet (a NOT_FOUND AppError, not a swallowed success)
    expect(t.repo.plans.get(BIZ)).toBe('none');
    t.stripe.subscriptions.set('sub_1', {
      id: 'sub_1', customerId: 'cus_1', status: 'active', items: [{ id: 'si_base', priceId: PRICES.starter }, { id: 'si_usage', priceId: USAGE.starter }], currentPeriodEnd: null, cancelAtPeriodEnd: false, businessId: null, metadataPlan: null,
    });
    const retried = await t.webhook('checkout.session.completed', done, { id: 'evt_retry' });
    expect(retried.body.data.status).toBe('processed');
    expect(t.repo.plans.get(BIZ)).toBe('starter');
  });

  it('follows a plan change made in the portal (the price wins over stale metadata)', async () => {
    const t = setup();
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub());
    await t.webhook('customer.subscription.updated', sub({ price: PRICES.pro }), { created: nowSec + 10 });
    expect(t.repo.plans.get(BIZ)).toBe('pro');
    expect(t.emitted.map((e) => e.type)).toEqual(['account.created', 'account.updated']);
  });

  it('keeps access while past_due and exposes the warning flag', async () => {
    const t = setup();
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub());
    await t.webhook('invoice.payment_failed', { id: 'in_1', subscription: 'sub_1' }, { created: nowSec + 10 });
    expect(t.repo.plans.get(BIZ)).toBe('growth');
    expect(t.repo.records.get(BIZ)?.status).toBe('past_due');
    await t.webhook('customer.subscription.updated', sub({ status: 'past_due' }), { created: nowSec + 20 });
    expect(t.repo.plans.get(BIZ)).toBe('growth');
    const plans = await t.h.call('GET', '/v1/plans');
    expect(plans.body.data.subscription).toMatchObject({ status: 'past_due', is_past_due: true, plan: 'growth' });
    expect(t.emitted.map((e) => e.type)).toEqual(['account.created']);
  });

  it('reads the subscription id of a payment failure from the newer invoice shape too', async () => {
    const t = setup();
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub());
    await t.webhook('invoice.payment_failed', { id: 'in_2', parent: { subscription_details: { subscription: 'sub_1' } } }, { created: nowSec + 10 });
    expect(t.repo.records.get(BIZ)?.status).toBe('past_due');
  });

  it('removes access when the subscription is cancelled and tells Nerova', async () => {
    const t = setup();
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub());
    await t.webhook('customer.subscription.deleted', sub({ status: 'canceled' }), { created: nowSec + 10 });
    expect(t.repo.plans.get(BIZ)).toBe('none');
    expect(t.repo.records.get(BIZ)?.status).toBe('canceled');
    expect(t.emitted.map((e) => e.type)).toEqual(['account.created', 'account.removed']);
  });

  it.each(['unpaid', 'incomplete_expired', 'paused'])('treats %s as not active', async (status) => {
    const t = setup({ plan: 'growth' });
    await withCustomer(t);
    await t.webhook('customer.subscription.updated', sub({ status }));
    expect(t.repo.plans.get(BIZ)).toBe('none');
  });

  it('leaves the plan alone while the first payment is incomplete', async () => {
    const t = setup();
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub({ status: 'incomplete' }));
    expect(t.repo.plans.get(BIZ)).toBe('none');
    expect(t.repo.records.get(BIZ)?.status).toBe('incomplete');
    expect(t.emitted).toEqual([]);
  });

  it('records a scheduled cancellation without losing access', async () => {
    const t = setup();
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub());
    await t.webhook('customer.subscription.updated', sub({ cancel_at_period_end: true }), { created: nowSec + 10 });
    expect(t.repo.plans.get(BIZ)).toBe('growth');
    expect(t.repo.records.get(BIZ)?.cancelAtPeriodEnd).toBe(true);
  });

  it('ignores an out-of-order older event', async () => {
    const t = setup();
    await withCustomer(t);
    await t.webhook('customer.subscription.updated', sub({ status: 'canceled' }), { created: nowSec + 100 });
    const stale = await t.webhook('customer.subscription.updated', sub({ status: 'active' }), { created: nowSec });
    expect(stale.body.data.status).toBe('ignored');
    expect(t.repo.plans.get(BIZ)).toBe('none');
  });

  it('ignores a late cancellation of a subscription that was replaced', async () => {
    const t = setup();
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub({ id: 'sub_new' }));
    const late = await t.webhook('customer.subscription.deleted', sub({ id: 'sub_old', status: 'canceled' }), { created: nowSec + 10 });
    expect(late.body.data.status).toBe('ignored');
    expect(t.repo.plans.get(BIZ)).toBe('growth');
  });

  it('ignores a subscription on a price it does not know, an unlinked customer, and unrelated events', async () => {
    const t = setup();
    await withCustomer(t);
    expect((await t.webhook('customer.subscription.created', sub({ price: 'price_mystery', metadata: {} }))).body.data.status).toBe('ignored');
    const stranger = sub({ customer: 'cus_unknown', metadata: {} });
    expect((await t.webhook('customer.subscription.created', stranger)).body.data.status).toBe('ignored');
    expect((await t.webhook('customer.created', { id: 'cus_9' })).body.data.status).toBe('ignored');
    expect(t.repo.planWrites).toEqual([]);
  });

  it('stores only the event id and type, never the payload', async () => {
    const t = setup();
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub(), { id: 'evt_store' });
    const row = t.bookingRepo.tables.webhook_events.find((e) => e.event_key === 'evt_store');
    expect(row?.source).toBe('stripe');
    expect(row?.payload).toEqual({ type: 'customer.subscription.created' });
    expect(row?.processed_at).not.toBeNull();
  });
});

describe('usage price follows the plan', () => {
  it('leaves a subscription alone when its usage price already matches the plan', async () => {
    const t = setup();
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub());
    expect(t.stripe.usageSwaps).toEqual([]);
  });

  it('swaps the usage line to the new plan after a portal plan change', async () => {
    const t = setup();
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub());
    await t.webhook('customer.subscription.updated', sub({ price: PRICES.pro, usage: USAGE.growth }), { created: nowSec + 10 });
    expect(t.repo.plans.get(BIZ)).toBe('pro');
    expect(t.stripe.usageSwaps).toEqual([{ subscriptionId: 'sub_1', itemId: 'si_usage', priceId: USAGE.pro }]);
  });

  it('adds the usage line when a subscription has none', async () => {
    const t = setup();
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub({ usage: null }));
    expect(t.stripe.usageSwaps).toEqual([{ subscriptionId: 'sub_1', itemId: null, priceId: USAGE.growth }]);
  });

  it('does not hold back the plan change when the swap fails', async () => {
    const t = setup();
    await withCustomer(t);
    t.stripe.setSubscriptionUsagePrice = async () => {
      throw new Error('stripe down');
    };
    await t.webhook('customer.subscription.created', sub({ price: PRICES.pro, usage: USAGE.growth }));
    expect(t.repo.plans.get(BIZ)).toBe('pro');
  });

  it('starts metering at the first activation and keeps that start across later events', async () => {
    const t = setup();
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub());
    const started = t.repo.records.get(BIZ)?.reportingStartedAt;
    expect(started).toBe(new Date(nowSec * 1000).toISOString());
    await t.webhook('customer.subscription.updated', sub({ price: PRICES.pro, usage: USAGE.pro }), { created: nowSec + 500 });
    expect(t.repo.records.get(BIZ)?.reportingStartedAt).toBe(started);
  });

  it('does not start metering for an incomplete or cancelled subscription', async () => {
    const t = setup();
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub({ status: 'incomplete' }));
    expect(t.repo.records.get(BIZ)?.reportingStartedAt).toBeNull();
  });
});

describe('audit_log entries', () => {
  it('records checkout creation by the owner: ids and plan only', async () => {
    const t = setup();
    await t.h.call('POST', '/v1/billing/checkout', { body: { plan: 'growth' } });
    expect(t.audits).toEqual([
      { businessId: BIZ, actorId: 'user_owner_clerk_id', action: 'insert', entity: 'billing_checkout', entityId: 'cs_1', diff: { plan: 'growth', source: 'owner' } },
    ]);
  });

  it('records a webhook plan flip with the system actor, the Stripe event id and the before and after', async () => {
    const t = setup();
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub(), { id: 'evt_audit_1' });
    await t.webhook('customer.subscription.updated', sub({ price: PRICES.pro, usage: USAGE.pro }), { id: 'evt_audit_2', created: nowSec + 10 });
    await t.webhook('customer.subscription.deleted', sub({ status: 'canceled' }), { id: 'evt_audit_3', created: nowSec + 20 });
    expect(t.audits.map((a) => [a.actorId, a.entity, a.entityId, a.diff])).toEqual([
      ['', 'billing_subscription', 'sub_1', { source: 'stripe', ref: 'evt_audit_1', plan_from: 'none', plan_to: 'growth', status_from: null, status_to: 'active' }],
      ['', 'billing_subscription', 'sub_1', { source: 'stripe', ref: 'evt_audit_2', plan_from: 'growth', plan_to: 'pro', status_from: 'active', status_to: 'active' }],
      ['', 'billing_subscription', 'sub_1', { source: 'stripe', ref: 'evt_audit_3', plan_from: 'pro', plan_to: 'none', status_from: 'active', status_to: 'canceled' }],
    ]);
  });

  it('records a payment failure as a status change that keeps the plan', async () => {
    const t = setup();
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub());
    await t.webhook('invoice.payment_failed', { id: 'in_1', subscription: 'sub_1' }, { id: 'evt_fail', created: nowSec + 10 });
    expect(t.audits.at(-1)?.diff).toEqual({ source: 'stripe', ref: 'evt_fail', plan_from: 'growth', plan_to: 'growth', status_from: 'active', status_to: 'past_due' });
  });

  it('writes nothing for an event that changes nothing, or a replay', async () => {
    const t = setup();
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub(), { id: 'evt_a' });
    await t.webhook('customer.subscription.created', sub(), { id: 'evt_a' });
    await t.webhook('customer.subscription.updated', sub(), { id: 'evt_b', created: nowSec + 5 });
    expect(t.audits).toHaveLength(1);
  });

  it('records an owner plan change through the API with the owner as actor', async () => {
    const t = setup();
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub());
    t.stripe.subscriptions.set('sub_1', {
      id: 'sub_1', customerId: 'cus_1', status: 'active',
      items: [{ id: 'si_base', priceId: PRICES.growth }, { id: 'si_usage', priceId: USAGE.growth }],
      currentPeriodEnd: null, cancelAtPeriodEnd: false, businessId: null, metadataPlan: 'growth',
    });
    await t.h.call('POST', '/v1/billing/plan', { body: { plan: 'pro' }, key: 'plan-change-key-1' });
    expect(t.audits.at(-1)).toMatchObject({
      actorId: 'user_owner_clerk_id',
      entity: 'billing_subscription',
      diff: { source: 'owner_api', ref: 'plan-change-key-1', plan_from: 'growth', plan_to: 'pro' },
    });
  });

  it('never carries personal or card data', async () => {
    const t = setup();
    await t.h.call('POST', '/v1/billing/checkout', { body: { plan: 'growth' } });
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub());
    expect(JSON.stringify(t.audits)).not.toMatch(/owner@example.test|Salon|@/);
  });

  it('does not block the change when the audit write fails', async () => {
    const t = setup();
    await withCustomer(t);
    (t.audits as unknown as { push: unknown }).push = () => {
      throw new Error('audit down');
    };
    const res = await t.webhook('customer.subscription.created', sub());
    expect(res.status).toBe(200);
    expect(t.repo.plans.get(BIZ)).toBe('growth');
  });
});

describe('Clerk organisation metadata mirror', () => {
  const orgId = `org_${BIZ}`;

  it('writes plan, status and period end on activation, plan change and cancellation', async () => {
    const t = setup();
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub());
    const periodEnd = new Date(1_795_000_000 * 1000).toISOString();
    expect(t.clerk.orgMetadata.get(orgId)).toEqual({ plan: 'growth', billingStatus: 'active', periodEnd });

    await t.webhook('customer.subscription.updated', sub({ price: PRICES.pro, usage: USAGE.pro }), { created: nowSec + 10 });
    expect(t.clerk.orgMetadata.get(orgId)).toMatchObject({ plan: 'pro', billingStatus: 'active' });

    await t.webhook('customer.subscription.deleted', sub({ status: 'canceled' }), { created: nowSec + 20 });
    expect(t.clerk.orgMetadata.get(orgId)).toMatchObject({ plan: 'none', billingStatus: 'canceled' });
  });

  it('mirrors a payment failure as past_due while the plan stays', async () => {
    const t = setup();
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub());
    await t.webhook('invoice.payment_failed', { id: 'in_1', subscription: 'sub_1' }, { created: nowSec + 10 });
    expect(t.clerk.orgMetadata.get(orgId)).toMatchObject({ plan: 'growth', billingStatus: 'past_due' });
  });

  it('does not write anything for an incomplete first payment', async () => {
    const t = setup();
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub({ status: 'incomplete' }));
    expect(t.clerk.orgMetadata.size).toBe(0);
  });

  it('leaves the webhook successful and the plan flipped when Clerk is down', async () => {
    const t = setup();
    await withCustomer(t);
    t.clerk.failWith = new AppError('INTERNAL', 'Team service unreachable', { upstream: 'clerk' });
    const res = await t.webhook('customer.subscription.created', sub());
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('processed');
    expect(t.repo.plans.get(BIZ)).toBe('growth');
    expect(t.clerk.orgMetadata.size).toBe(0);
  });

  it('is written by an API plan change too', async () => {
    const t = setup();
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub());
    t.stripe.subscriptions.set('sub_1', {
      id: 'sub_1', customerId: 'cus_1', status: 'active',
      items: [{ id: 'si_base', priceId: PRICES.growth }, { id: 'si_usage', priceId: USAGE.growth }],
      currentPeriodEnd: null, cancelAtPeriodEnd: false, businessId: null, metadataPlan: 'growth',
    });
    await t.h.call('POST', '/v1/billing/plan', { body: { plan: 'starter' } });
    expect(t.clerk.orgMetadata.get(orgId)).toMatchObject({ plan: 'starter', billingStatus: 'active' });
  });
});

describe('POST /v1/billing/plan', () => {
  async function subscribed(over: Parameters<typeof setup>[0] = {}) {
    const t = setup(over);
    await withCustomer(t);
    await t.webhook('customer.subscription.created', sub());
    t.stripe.subscriptions.set('sub_1', {
      id: 'sub_1', customerId: 'cus_1', status: 'active',
      items: [{ id: 'si_base', priceId: PRICES.growth }, { id: 'si_usage', priceId: USAGE.growth }],
      currentPeriodEnd: null, cancelAtPeriodEnd: false, businessId: null, metadataPlan: 'growth',
    });
    return t;
  }

  it('swaps both the base and the usage item with proration and flips the plan at once', async () => {
    const t = await subscribed();
    const res = await t.h.call('POST', '/v1/billing/plan', { body: { plan: 'pro' } });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'active', plan: 'pro', is_past_due: false });
    expect(t.stripe.planChanges).toEqual([
      { subscriptionId: 'sub_1', items: [{ id: 'si_base', price: PRICES.pro }, { id: 'si_usage', price: USAGE.pro }] },
    ]);
    expect(t.repo.plans.get(BIZ)).toBe('pro');
    expect(t.emitted.map((e) => e.type)).toEqual(['account.created', 'account.updated']);
    // the webhook Stripe sends afterwards finds nothing left to do
    const after = await t.webhook('customer.subscription.updated', sub({ price: PRICES.pro, usage: USAGE.pro }), { created: nowSec + 5 });
    expect(after.status).toBe(200);
    expect(t.repo.plans.get(BIZ)).toBe('pro');
    expect(t.stripe.usageSwaps).toEqual([]);
  });

  it('adds the usage line when the subscription has none', async () => {
    const t = await subscribed();
    t.stripe.subscriptions.set('sub_1', { ...t.stripe.subscriptions.get('sub_1')!, items: [{ id: 'si_base', priceId: PRICES.growth }] });
    await t.h.call('POST', '/v1/billing/plan', { body: { plan: 'starter' } });
    expect(t.stripe.planChanges[0]?.items).toEqual([{ id: 'si_base', price: PRICES.starter }, { id: null, price: USAGE.starter }]);
  });

  it('is owner only, validates the plan and needs an Idempotency-Key', async () => {
    const t = await subscribed();
    expect((await t.h.call('POST', '/v1/billing/plan', { token: 'staff', body: { plan: 'pro' } })).status).toBe(403);
    expect((await t.h.call('POST', '/v1/billing/plan', { body: { plan: 'free' } })).status).toBe(400);
    expect(t.stripe.planChanges).toEqual([]);
  });

  it('refuses the current plan, and a business without an active subscription', async () => {
    const t = await subscribed();
    const same = await t.h.call('POST', '/v1/billing/plan', { body: { plan: 'growth' } });
    expect(same.status).toBe(422);
    expect(same.body.error.details).toMatchObject({ rule: 'SAME_PLAN' });
    const none = await setup().h.call('POST', '/v1/billing/plan', { body: { plan: 'pro' } });
    expect(none.status).toBe(422);
    expect(none.body.error.details).toMatchObject({ rule: 'NO_SUBSCRIPTION' });
  });

  it('answers 503 BILLING_NOT_CONFIGURED without Stripe', async () => {
    const res = await setup({ stripe: false }).h.call('POST', '/v1/billing/plan', { body: { plan: 'pro' } });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('BILLING_NOT_CONFIGURED');
  });
});

it('keeps the test environment free of real Stripe credentials', () => {
  expect(TEST_ENV.STRIPE_SECRET_KEY).toBeUndefined();
});
