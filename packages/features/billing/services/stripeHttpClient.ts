/**
 * StripeClient over the Stripe REST API with fetch (form-encoded, Bearer secret key). Used instead of the `stripe`
 * npm package: we need a handful of calls, it keeps the Edge bundle and the pinned dependency list unchanged, and the port
 * keeps the choice reversible. Never logs request or response bodies (customer emails live there).
 */
import { AppError } from '../../lib/errors.ts';
import type { UUID } from '@booking/types';
import { asRecord, asString, parseSubscription, refId, UUID_RE } from '../lib/stripeObjects.ts';
import type { PlanChangeItem, StripeCheckoutSession, StripeClient } from '../ports.ts';

const STRIPE_API = 'https://api.stripe.com/v1';

export interface StripeHttpOptions {
  secretKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  baseUrl?: string;
  /** Injected so tests never wait */
  sleep?: (ms: number) => Promise<void>;
  /** Delays before retries of calls that are safe to repeat (meter events) */
  backoffMs?: readonly number[];
}

type FormValue = string | number | boolean | null | undefined | FormValue[] | { [key: string]: FormValue };

const formItems = (items: PlanChangeItem[]): { [key: string]: FormValue }[] => items.map(({ id, price, quantity }) => ({ id, price, quantity }));

/** Stripe's nested form encoding: `a[b][0][c]=v`. Null and undefined are skipped. */
export function encodeForm(params: { [key: string]: FormValue }): string {
  const pairs: string[] = [];
  const walk = (prefix: string, value: FormValue): void => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) value.forEach((item, index) => walk(`${prefix}[${index}]`, item));
    else if (typeof value === 'object') for (const [key, inner] of Object.entries(value)) walk(`${prefix}[${key}]`, inner);
    else pairs.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
  };
  for (const [key, value] of Object.entries(params)) walk(key, value);
  return pairs.join('&');
}

export function createStripeHttpClient(options: StripeHttpOptions): StripeClient {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl ?? STRIPE_API;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const backoff = options.backoffMs ?? [500, 2000, 8000];

  async function call(method: 'GET' | 'POST', path: string, params?: { [key: string]: FormValue }, idempotencyKey?: string): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = { authorization: `Bearer ${options.secretKey}` };
    if (method === 'POST') headers['content-type'] = 'application/x-www-form-urlencoded';
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        headers,
        body: method === 'POST' && params ? encodeForm(params) : undefined,
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      });
    } catch {
      throw new AppError('UPSTREAM_BILLING_ERROR', 'Could not reach the payment provider', { path });
    }
    const body = asRecord(await response.json().catch(() => null));
    if (!response.ok) {
      const error = asRecord(body.error);
      throw new AppError('UPSTREAM_BILLING_ERROR', 'The payment provider refused the request', {
        path,
        status: response.status,
        stripe_code: asString(error.code),
        stripe_type: asString(error.type),
      });
    }
    return body;
  }

  /** Repeats a call on 429, 5xx and network failures. Only for calls that Stripe dedupes (idempotency key or event identifier). */
  async function callWithRetry(path: string, params: { [key: string]: FormValue }, idempotencyKey: string): Promise<Record<string, unknown>> {
    for (let tries = 0; ; tries++) {
      try {
        return await call('POST', path, params, idempotencyKey);
      } catch (error) {
        const status = error instanceof AppError ? (error.details?.status as number | undefined) : undefined;
        const retryable = status === undefined || status === 429 || status >= 500;
        if (!retryable || tries >= backoff.length) throw error;
        await sleep(backoff[tries] ?? 0);
      }
    }
  }

  /** The state of the payment on an open invoice: needs the customer (3DS) or was declined. Reads the invoice's payment intent. */
  async function invoicePaymentState(invoiceId: string): Promise<'requires_action' | 'failed'> {
    const body = await call('GET', `/invoice_payments?invoice=${encodeURIComponent(invoiceId)}&expand[0]=data.payment.payment_intent`);
    const payments = Array.isArray(body.data) ? body.data.map(asRecord) : [];
    const statuses = payments.map((payment) => asString(asRecord(asRecord(payment.payment).payment_intent).status));
    return statuses.some((status) => status === 'requires_action' || status === 'processing') ? 'requires_action' : 'failed';
  }

  const need = (value: unknown, what: string): string => {
    const text = asString(value);
    if (!text) throw new AppError('UPSTREAM_BILLING_ERROR', `The payment provider returned no ${what}`);
    return text;
  };

  return {
    async createCustomer({ businessId, name, email, idempotencyKey }) {
      const body = await call('POST', '/customers', { name, email, metadata: { business_id: businessId } }, idempotencyKey);
      return { id: need(body.id, 'customer id') };
    },
    async createCheckoutSession(input) {
      const metadata = { business_id: input.businessId, plan: input.plan };
      const body = await call(
        'POST',
        '/checkout/sessions',
        {
          mode: 'subscription',
          customer: input.customerId,
          client_reference_id: input.businessId,
          // Base fee (quantity 1) plus the metered usage price: the plan's allowance at R0, then R4 per extra booking.
          line_items: [{ price: input.priceId, quantity: 1 }, { price: input.usagePriceId }],
          ...(input.embedded
            ? {
                // Managed Payments only allows embedded_page; our own page renders it and confirms through the API.
                ui_mode: 'embedded_page',
                redirect_on_completion: 'never',
                branding_settings: { button_color: '#0A69DB', background_color: '#FFFFFF', border_style: 'rounded', font_family: 'inter' },
              }
            : { success_url: input.successUrl, cancel_url: input.cancelUrl }),
          metadata,
          subscription_data: { metadata },
        },
        input.idempotencyKey,
      );
      return { id: need(body.id, 'session id'), url: asString(body.url), clientSecret: asString(body.client_secret) };
    },
    async listOpenCheckoutSessions(customerId) {
      const body = await call('GET', `/checkout/sessions?customer=${encodeURIComponent(customerId)}&status=open&limit=100`);
      const data = Array.isArray(body.data) ? body.data : [];
      return data.flatMap((row) => {
        const id = asString(asRecord(row).id);
        return id ? [{ id }] : [];
      });
    },
    async expireCheckoutSession(sessionId) {
      try {
        await call('POST', `/checkout/sessions/${encodeURIComponent(sessionId)}/expire`, {});
      } catch (error) {
        // Completed or expired in the meantime: nothing left to expire.
        if (!(error instanceof AppError && error.details?.status === 400)) throw error;
      }
    },
    async listSubscriptions(customerId) {
      const body = await call('GET', `/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=100`);
      const data = Array.isArray(body.data) ? body.data : [];
      return data.flatMap((row) => {
        const sub = parseSubscription(row);
        return sub ? [sub] : [];
      });
    },
    async retrieveCheckoutSession(sessionId) {
      let body: Record<string, unknown>;
      try {
        body = await call('GET', `/checkout/sessions/${encodeURIComponent(sessionId)}`);
      } catch (error) {
        if (error instanceof AppError && error.details?.status === 404) return null;
        throw error;
      }
      const status = asString(body.status);
      const payment = asString(body.payment_status);
      if (!asString(body.id) || (status !== 'open' && status !== 'complete' && status !== 'expired')) return null;
      const businessId = asString(asRecord(body.metadata).business_id) ?? asString(body.client_reference_id);
      const session: StripeCheckoutSession = {
        id: sessionId,
        status,
        paymentStatus: payment === 'paid' || payment === 'no_payment_required' ? payment : 'unpaid',
        mode: asString(body.mode),
        subscriptionId: asString(body.subscription) ?? asString(asRecord(body.subscription).id),
        businessId: businessId && UUID_RE.test(businessId) ? (businessId as UUID) : null,
        created: typeof body.created === 'number' ? body.created : 0,
      };
      return session;
    },
    async createPortalSession({ customerId, returnUrl }) {
      const body = await call('POST', '/billing_portal/sessions', { customer: customerId, return_url: returnUrl });
      return { url: need(body.url, 'portal url') };
    },
    async retrieveSubscription(subscriptionId) {
      const body = await call('GET', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
      const sub = parseSubscription(body);
      if (!sub) throw new AppError('UPSTREAM_BILLING_ERROR', 'The payment provider returned an unreadable subscription');
      return sub;
    },
    async previewUpgrade({ subscriptionId, items, prorationDate }) {
      // The proration delta only: always_invoice at a pinned date makes the preview equal to what the update charges.
      const body = await call('POST', '/invoices/create_preview', {
        subscription: subscriptionId,
        subscription_details: { items: formItems(items), proration_behavior: 'always_invoice', proration_date: prorationDate },
      });
      const due = body.amount_due;
      if (typeof due !== 'number') throw new AppError('UPSTREAM_BILLING_ERROR', 'The payment provider returned no invoice preview');
      return { amountDueCents: due, currency: (asString(body.currency) ?? 'zar').toUpperCase() };
    },
    async upgradeSubscriptionPlan({ subscriptionId, items, prorationDate, idempotencyKey }) {
      const body = await call(
        'POST',
        `/subscriptions/${encodeURIComponent(subscriptionId)}`,
        { items: formItems(items), proration_behavior: 'always_invoice', payment_behavior: 'pending_if_incomplete', proration_date: prorationDate, expand: ['latest_invoice'] },
        idempotencyKey,
      );
      const subscription = parseSubscription(body);
      if (!subscription) throw new AppError('UPSTREAM_BILLING_ERROR', 'The payment provider returned an unreadable subscription');
      // A paid invoice leaves no pending update; anything else (3DS, declined) keeps the old prices until the invoice is paid.
      const invoice = asRecord(body.latest_invoice);
      const invoiceId = asString(invoice.id);
      const hostedInvoiceUrl = asString(invoice.hosted_invoice_url);
      if (body.pending_update == null && (invoice.status === 'paid' || invoiceId === null)) {
        return { subscription, payment: 'paid', invoiceId, hostedInvoiceUrl };
      }
      if (!invoiceId) throw new AppError('UPSTREAM_BILLING_ERROR', 'The payment provider returned a pending change without an invoice');
      return { subscription, payment: await invoicePaymentState(invoiceId), invoiceId, hostedInvoiceUrl };
    },
    async voidInvoice(invoiceId) {
      try {
        await call('POST', `/invoices/${encodeURIComponent(invoiceId)}/void`, {});
      } catch (error) {
        // Paid or voided in the meantime: nothing to void.
        if (!(error instanceof AppError && error.details?.status === 400)) throw error;
      }
    },
    async scheduleDowngrade({ subscriptionId, items, idempotencyKey }) {
      const created = await call('POST', '/subscription_schedules', { from_subscription: subscriptionId }, `${idempotencyKey}:create`);
      const scheduleId = need(created.id, 'schedule id');
      const phases = Array.isArray(created.phases) ? created.phases.map(asRecord) : [];
      const current = phases[0];
      if (!current) throw new AppError('UPSTREAM_BILLING_ERROR', 'The payment provider returned a schedule without a phase');
      const currentItems = (Array.isArray(current.items) ? current.items.map(asRecord) : []).flatMap((item) => {
        const price = refId(item.price);
        return price ? [typeof item.quantity === 'number' ? { price, quantity: item.quantity } : { price }] : [];
      });
      // Phase 1 keeps today's prices to the period end; phase 2 (one cycle, then the schedule releases) carries the new plan.
      await call(
        'POST',
        `/subscription_schedules/${encodeURIComponent(scheduleId)}`,
        {
          end_behavior: 'release',
          proration_behavior: 'none',
          phases: [{ items: currentItems, start_date: Number(current.start_date), end_date: Number(current.end_date) }, { items }],
        },
        `${idempotencyKey}:phases`,
      );
      return { scheduleId };
    },
    async releaseSchedule(scheduleId) {
      try {
        await call('POST', `/subscription_schedules/${encodeURIComponent(scheduleId)}/release`, {});
      } catch (error) {
        // Already released, completed or cancelled: the subscription is free of it either way.
        if (!(error instanceof AppError && error.details?.status === 400)) throw error;
      }
    },
    async setSubscriptionUsagePrice({ subscriptionId, itemId, priceId, idempotencyKey }) {
      await call(
        'POST',
        `/subscriptions/${encodeURIComponent(subscriptionId)}`,
        { items: [{ id: itemId, price: priceId }], proration_behavior: 'none' },
        idempotencyKey,
      );
    },
    async createMeterEvent({ eventName, identifier, customerId, timestamp, value }) {
      try {
        await callWithRetry(
          '/billing/meter_events',
          {
            event_name: eventName,
            identifier,
            timestamp: Math.floor(timestamp.getTime() / 1000),
            payload: { stripe_customer_id: customerId, value: String(value) },
          },
          `meter:${identifier}`,
        );
      } catch (error) {
        // A repeated identifier means Stripe already has the event: that is the outcome we want.
        const code = error instanceof AppError ? String(error.details?.stripe_code ?? '') : '';
        if (!/duplicate|already_exists|idempotency/.test(code)) throw error;
      }
    },
  };
}
