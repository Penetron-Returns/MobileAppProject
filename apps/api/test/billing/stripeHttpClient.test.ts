import { describe, expect, it } from 'vitest';

import { signStripePayload, verifyStripeSignature } from '@booking/features/billing/lib/stripeSignature.ts';
import { parseSubscription } from '@booking/features/billing/lib/stripeObjects.ts';
import { createStripeHttpClient, encodeForm } from '@booking/features/billing/services/stripeHttpClient.ts';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

function client(responses: { status: number; body?: unknown }[], sleeps: number[] = []) {
  const calls: Call[] = [];
  const stripe = createStripeHttpClient({
    secretKey: 'sk_test_secret',
    sleep: async (ms) => void sleeps.push(ms),
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method ?? 'GET', headers: init.headers as Record<string, string>, body: String(init.body ?? '') });
      const next = responses.shift() ?? { status: 200, body: {} };
      return new Response(JSON.stringify(next.body ?? {}), { status: next.status });
    }) as unknown as typeof fetch,
  });
  return { stripe, calls, sleeps };
}

describe('encodeForm', () => {
  it('nests objects and arrays the way Stripe expects and skips empty values', () => {
    const body = encodeForm({ mode: 'subscription', line_items: [{ price: 'price_a', quantity: 1 }, { price: 'price_b' }], metadata: { business_id: 'b', skipped: null }, name: undefined });
    expect(decodeURIComponent(body)).toBe(
      'mode=subscription&line_items[0][price]=price_a&line_items[0][quantity]=1&line_items[1][price]=price_b&metadata[business_id]=b',
    );
  });
});

describe('StripeClient over fetch', () => {
  it('creates a checkout session with the base price (qty 1) and the usage price (no quantity)', async () => {
    const { stripe, calls } = client([{ status: 200, body: { id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' } }]);
    const session = await stripe.createCheckoutSession({
      customerId: 'cus_1',
      priceId: 'price_base',
      usagePriceId: 'price_usage',
      businessId: '10000000-0000-4000-8000-0000000000aa',
      plan: 'growth',
      successUrl: 'clovie://ok',
      cancelUrl: 'clovie://no',
      idempotencyKey: 'checkout:k',
    });
    expect(session).toEqual({ id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1', clientSecret: null });
    expect(new URLSearchParams(calls[0]!.body).get('success_url')).toBe('clovie://ok');
    expect(new URLSearchParams(calls[0]!.body).has('ui_mode')).toBe(false);
    const call = calls[0]!;
    expect(call.url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(call.headers.authorization).toBe('Bearer sk_test_secret');
    expect(call.headers['idempotency-key']).toBe('checkout:k');
    const form = new URLSearchParams(call.body);
    expect(form.get('mode')).toBe('subscription');
    expect(form.get('client_reference_id')).toBe('10000000-0000-4000-8000-0000000000aa');
    expect(form.get('line_items[0][price]')).toBe('price_base');
    expect(form.get('line_items[0][quantity]')).toBe('1');
    expect(form.get('line_items[1][price]')).toBe('price_usage');
    expect(form.has('line_items[1][quantity]')).toBe(false);
    expect(form.get('subscription_data[metadata][plan]')).toBe('growth');
  });

  it('sends a meter event: name, identifier, unix timestamp, payload with the customer and value "1"', async () => {
    const { stripe, calls } = client([{ status: 200 }]);
    await stripe.createMeterEvent({ eventName: 'booking_made', identifier: 'booking:a1', customerId: 'cus_1', timestamp: new Date('2026-09-30T21:59:59Z'), value: 1 });
    const call = calls[0]!;
    expect(call.url).toBe('https://api.stripe.com/v1/billing/meter_events');
    const form = new URLSearchParams(call.body);
    expect(form.get('event_name')).toBe('booking_made');
    expect(form.get('identifier')).toBe('booking:a1');
    expect(form.get('timestamp')).toBe(String(Date.parse('2026-09-30T21:59:59Z') / 1000));
    expect(form.get('payload[stripe_customer_id]')).toBe('cus_1');
    expect(form.get('payload[value]')).toBe('1');
  });

  it('retries a meter event on 429 and 5xx with backoff, then succeeds', async () => {
    const { stripe, calls, sleeps } = client([{ status: 429 }, { status: 503 }, { status: 200 }]);
    await stripe.createMeterEvent({ eventName: 'booking_made', identifier: 'booking:a1', customerId: 'cus_1', timestamp: new Date(), value: 1 });
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([500, 2000]);
    expect(new Set(calls.map((c) => c.headers['idempotency-key']))).toEqual(new Set(['meter:booking:a1']));
  });

  it('gives up after the backoff is used up, and does not retry a 400', async () => {
    const down = client([{ status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }]);
    await expect(down.stripe.createMeterEvent({ eventName: 'e', identifier: 'booking:a', customerId: 'c', timestamp: new Date(), value: 1 })).rejects.toMatchObject({
      code: 'UPSTREAM_BILLING_ERROR',
    });
    expect(down.calls).toHaveLength(4);
    const bad = client([{ status: 400, body: { error: { code: 'invalid_request', type: 'invalid_request_error' } } }]);
    await expect(bad.stripe.createMeterEvent({ eventName: 'e', identifier: 'booking:a', customerId: 'c', timestamp: new Date(), value: 1 })).rejects.toMatchObject({
      details: { status: 400, stripe_code: 'invalid_request' },
    });
    expect(bad.calls).toHaveLength(1);
  });

  it('treats an already recorded identifier as success', async () => {
    const { stripe } = client([{ status: 400, body: { error: { code: 'billing_meter_event_duplicate_identifier' } } }]);
    await expect(stripe.createMeterEvent({ eventName: 'e', identifier: 'booking:a', customerId: 'c', timestamp: new Date(), value: 1 })).resolves.toBeUndefined();
  });

  it('never leaks the response body into the error', async () => {
    const { stripe } = client([{ status: 402, body: { error: { code: 'card_declined', message: 'Card for jane@example.test declined' } } }]);
    const error = await stripe.createPortalSession({ customerId: 'cus_1', returnUrl: 'x' }).catch((e: Error) => e);
    expect(JSON.stringify(error)).not.toContain('jane@example.test');
    expect(String((error as Error).message)).not.toContain('jane@example.test');
  });

  it('swaps or adds the usage line on a subscription without proration', async () => {
    const { stripe, calls } = client([{ status: 200 }, { status: 200 }]);
    await stripe.setSubscriptionUsagePrice({ subscriptionId: 'sub_1', itemId: 'si_usage', priceId: 'price_new', idempotencyKey: 'k1' });
    await stripe.setSubscriptionUsagePrice({ subscriptionId: 'sub_1', itemId: null, priceId: 'price_new', idempotencyKey: 'k2' });
    const first = new URLSearchParams(calls[0]!.body);
    expect(calls[0]!.url).toBe('https://api.stripe.com/v1/subscriptions/sub_1');
    expect(first.get('items[0][id]')).toBe('si_usage');
    expect(first.get('items[0][price]')).toBe('price_new');
    expect(first.get('proration_behavior')).toBe('none');
    expect(new URLSearchParams(calls[1]!.body).has('items[0][id]')).toBe(false);
  });

  describe('plan changes', () => {
    const ITEMS = [{ id: 'si_base', price: 'price_pro', quantity: 1 }, { id: 'si_usage', price: 'price_pro_usage' }];
    const subBody = (over: Record<string, unknown> = {}) => ({
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      items: { data: [{ id: 'si_base', price: { id: 'price_growth' }, current_period_end: 1_795_000_000 }] },
      ...over,
    });

    it('previews an upgrade as the proration invoice at the pinned date, creating nothing', async () => {
      const { stripe, calls } = client([{ status: 200, body: { amount_due: 59_950, currency: 'zar' } }]);
      const quote = await stripe.previewUpgrade({ subscriptionId: 'sub_1', items: ITEMS, prorationDate: 1_792_000_000 });
      expect(quote).toEqual({ amountDueCents: 59_950, currency: 'ZAR' });
      expect(calls[0]!.url).toBe('https://api.stripe.com/v1/invoices/create_preview');
      const form = new URLSearchParams(calls[0]!.body);
      expect(form.get('subscription')).toBe('sub_1');
      expect(form.get('subscription_details[proration_behavior]')).toBe('always_invoice');
      expect(form.get('subscription_details[proration_date]')).toBe('1792000000');
      expect(form.get('subscription_details[items][0][id]')).toBe('si_base');
      expect(form.get('subscription_details[items][0][price]')).toBe('price_pro');
      expect(form.get('subscription_details[items][0][quantity]')).toBe('1');
      expect(form.get('subscription_details[items][1][price]')).toBe('price_pro_usage');
      expect(form.has('subscription_details[items][1][quantity]')).toBe(false);
    });

    it('upgrades with pending_if_incomplete and always_invoice, and reports a paid invoice', async () => {
      const { stripe, calls } = client([{ status: 200, body: subBody({ pending_update: null, latest_invoice: { id: 'in_1', status: 'paid' } }) }]);
      const result = await stripe.upgradeSubscriptionPlan({ subscriptionId: 'sub_1', items: ITEMS, prorationDate: 1_792_000_000, idempotencyKey: 'plan:k' });
      expect(result).toMatchObject({ payment: 'paid', invoiceId: 'in_1' });
      expect(calls).toHaveLength(1);
      expect(calls[0]!.headers['idempotency-key']).toBe('plan:k');
      const form = new URLSearchParams(calls[0]!.body);
      expect(form.get('proration_behavior')).toBe('always_invoice');
      expect(form.get('payment_behavior')).toBe('pending_if_incomplete');
      expect(form.get('proration_date')).toBe('1792000000');
      expect(form.get('items[0][id]')).toBe('si_base');
      expect(form.get('items[0][quantity]')).toBe('1');
      expect(form.get('expand[0]')).toBe('latest_invoice');
    });

    it('tells a card that needs authentication from a declined one by the invoice payment intent', async () => {
      const pending = { pending_update: { expires_at: 1 }, latest_invoice: { id: 'in_1', status: 'open', hosted_invoice_url: 'https://invoice.stripe.com/i/x' } };
      const action = client([{ status: 200, body: subBody(pending) }, { status: 200, body: { data: [{ payment: { payment_intent: { status: 'requires_action' } } }] } }]);
      expect(await action.stripe.upgradeSubscriptionPlan({ subscriptionId: 'sub_1', items: ITEMS, prorationDate: 1, idempotencyKey: 'k' })).toMatchObject({
        payment: 'requires_action',
        hostedInvoiceUrl: 'https://invoice.stripe.com/i/x',
      });
      expect(action.calls[1]!.url).toContain('/v1/invoice_payments?invoice=in_1');

      const declined = client([{ status: 200, body: subBody(pending) }, { status: 200, body: { data: [{ payment: { payment_intent: { status: 'requires_payment_method' } } }] } }]);
      expect(await declined.stripe.upgradeSubscriptionPlan({ subscriptionId: 'sub_1', items: ITEMS, prorationDate: 1, idempotencyKey: 'k' })).toMatchObject({ payment: 'failed', invoiceId: 'in_1' });
    });

    it('schedules a downgrade as a second phase after the current prices, with no proration', async () => {
      const created = { id: 'sub_sched_1', phases: [{ start_date: 100, end_date: 200, items: [{ price: 'price_pro', quantity: 1 }, { price: 'price_pro_usage', quantity: null }] }] };
      const { stripe, calls } = client([{ status: 200, body: created }, { status: 200, body: {} }]);
      const items = [{ price: 'price_starter', quantity: 1 }, { price: 'price_starter_usage' }];
      expect(await stripe.scheduleDowngrade({ subscriptionId: 'sub_1', items, idempotencyKey: 'plan:k' })).toEqual({ scheduleId: 'sub_sched_1' });
      expect(calls[0]!.url).toBe('https://api.stripe.com/v1/subscription_schedules');
      expect(new URLSearchParams(calls[0]!.body).get('from_subscription')).toBe('sub_1');
      expect(calls[0]!.headers['idempotency-key']).toBe('plan:k:create');
      expect(calls[1]!.url).toBe('https://api.stripe.com/v1/subscription_schedules/sub_sched_1');
      expect(calls[1]!.headers['idempotency-key']).toBe('plan:k:phases');
      const form = new URLSearchParams(calls[1]!.body);
      expect(form.get('end_behavior')).toBe('release');
      expect(form.get('proration_behavior')).toBe('none');
      expect(form.get('phases[0][start_date]')).toBe('100');
      expect(form.get('phases[0][end_date]')).toBe('200');
      expect(form.get('phases[0][items][0][price]')).toBe('price_pro');
      expect(form.get('phases[0][items][0][quantity]')).toBe('1');
      expect(form.has('phases[0][items][1][quantity]')).toBe(false);
      expect(form.get('phases[1][items][0][price]')).toBe('price_starter');
      expect(form.get('phases[1][items][1][price]')).toBe('price_starter_usage');
      expect(form.has('phases[1][end_date]')).toBe(false);
    });

    it('releases a schedule and voids an invoice, treating an already-done one as success', async () => {
      const { stripe, calls } = client([{ status: 200 }, { status: 400, body: { error: { code: 'subscription_schedule_already_released' } } }, { status: 200 }, { status: 400, body: { error: { code: 'invoice_not_open' } } }]);
      await stripe.releaseSchedule('sub_sched_1');
      await stripe.releaseSchedule('sub_sched_1');
      await stripe.voidInvoice('in_1');
      await stripe.voidInvoice('in_1');
      expect(calls.map((c) => c.url)).toEqual([
        'https://api.stripe.com/v1/subscription_schedules/sub_sched_1/release',
        'https://api.stripe.com/v1/subscription_schedules/sub_sched_1/release',
        'https://api.stripe.com/v1/invoices/in_1/void',
        'https://api.stripe.com/v1/invoices/in_1/void',
      ]);
    });

    it('reads the schedule id of a subscription', () => {
      expect(parseSubscription(subBody({ schedule: 'sub_sched_9' }))?.scheduleId).toBe('sub_sched_9');
      expect(parseSubscription(subBody({ schedule: null }))?.scheduleId).toBeNull();
    });
  });
});

describe('Stripe-Signature', () => {
  const NOW = new Date('2026-10-13T10:00:00Z');
  const ts = Math.floor(NOW.getTime() / 1000);
  const body = '{"id":"evt_1"}';

  it('accepts a valid signature, also when a rolled secret adds a second v1', () => {
    const header = signStripePayload('whsec_a', body, ts);
    expect(verifyStripeSignature('whsec_a', body, header, NOW)).toEqual({ ok: true });
    expect(verifyStripeSignature('whsec_a', body, `t=${ts},v1=${'0'.repeat(64)},v1=${header.split('v1=')[1]}`, NOW)).toEqual({ ok: true });
  });

  it.each([
    ['missing', undefined, 'missing'],
    ['malformed', 'nonsense', 'malformed'],
    ['wrong secret', signStripePayload('whsec_b', body, ts), 'mismatch'],
    ['stale (6 minutes old)', signStripePayload('whsec_a', body, ts - 360), 'stale'],
    ['from the future', signStripePayload('whsec_a', body, ts + 360), 'stale'],
  ])('rejects %s', (_name, header, reason) => {
    expect(verifyStripeSignature('whsec_a', body, header, NOW)).toEqual({ ok: false, reason });
  });

  it('rejects a body that was changed after signing', () => {
    expect(verifyStripeSignature('whsec_a', `${body} `, signStripePayload('whsec_a', body, ts), NOW)).toEqual({ ok: false, reason: 'mismatch' });
  });
});

describe('parseSubscription', () => {
  it('reads the period end from the subscription or, in newer API versions, from its items', () => {
    const base = { id: 'sub_1', customer: 'cus_1', status: 'active', items: { data: [{ id: 'si_1', price: { id: 'price_a' }, current_period_end: 1_795_000_000 }] } };
    expect(parseSubscription(base)?.currentPeriodEnd).toBe(new Date(1_795_000_000 * 1000).toISOString());
    expect(parseSubscription({ ...base, current_period_end: 1_790_000_000 })?.currentPeriodEnd).toBe(new Date(1_790_000_000 * 1000).toISOString());
  });

  it('rejects unknown statuses and malformed objects, and ignores a business id that is not a UUID', () => {
    expect(parseSubscription({ id: 'sub_1', customer: 'cus_1', status: 'weird' })).toBeNull();
    expect(parseSubscription(null)).toBeNull();
    expect(parseSubscription({ id: 'sub_1', customer: { id: 'cus_1' }, status: 'active', metadata: { business_id: 'nope' } })).toMatchObject({ customerId: 'cus_1', businessId: null });
  });
});
