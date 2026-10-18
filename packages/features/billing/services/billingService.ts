/**
 * Billing use cases: Stripe Checkout and Portal sessions for the owner, and the webhook handler that turns
 * subscription state into `businesses.plan`. Stripe is reached only through the StripeClient port, and Nerova
 * is told about activations through AccountEventsPort (in the background: the Stripe response never waits for it).
 */
import type { PlanKey, SubscriptionDTO, SubscriptionStatus, UUID } from '@booking/types';
import { AppError, notFound, ruleViolation } from '../../lib/errors.ts';
import { PLAN_CATALOG, PLAN_CURRENCY } from '../../plans/lib/planCatalog.ts';
import { createLogger, type Logger } from '../../lib/logger.ts';
import type { AccountEventsPort, ClerkAdmin } from '../../ports.ts';
import { REPORT_HORIZON_MS, accessFor, isCompanionPlan, isPaidPlan, isUsagePrice, planForPrice, priceIdFor, usagePriceFor } from '../lib/policy.ts';
import { asRecord, asString, parseSubscription, refId } from '../lib/stripeObjects.ts';
import type {
  BillingAudit,
  BillingAuditEntry,
  BillingConfig,
  BillingEventOutcome,
  BookingMeter,
  BillingRecord,
  BillingRepository,
  BillingService,
  CheckoutConfirmation,
  BillingSummary,
  PaidPlan,
  ReportOutcome,
  UnreportedBooking,
  StripeClient,
  StripeEvent,
  StripeSubscription,
} from '../ports.ts';

export interface BillingDeps {
  /** Null when STRIPE_SECRET_KEY is not set: owner routes answer BILLING_NOT_CONFIGURED */
  stripe: StripeClient | null;
  /** Null when prices or return URLs are missing */
  config: BillingConfig | null;
  repo: BillingRepository;
  events: AccountEventsPort;
  /** Mirrors the plan to the Clerk organisation (publicMetadata). Omitted = no mirror. */
  clerk?: Pick<ClerkAdmin, 'updateOrganizationPublicMetadata'>;
  /** audit_log writer. Omitted = no audit (never in production). */
  audit?: BillingAudit;
  /** Runs a task without blocking the caller (EdgeRuntime.waitUntil in production) */
  defer?: (task: () => Promise<void>) => void;
  logger?: Logger;
  clock?: () => Date;
}

const notConfigured = (what: string, details?: Record<string, unknown>) =>
  new AppError('BILLING_NOT_CONFIGURED', `Billing is not configured: ${what}`, details);

export function createBillingService(deps: BillingDeps): BillingService & BillingSummary & BookingMeter {
  const { repo } = deps;
  const logger = deps.logger ?? createLogger({ module: 'billing' });
  const clock = deps.clock ?? (() => new Date());
  const defer = deps.defer ?? ((task) => void task().catch(() => undefined));

  /**
   * audit_log for a billing change. A failed audit write is logged and never blocks the change itself (the checkout
   * session or plan already exists at Stripe); the Stripe event / request id in the diff lets it be reconstructed.
   */
  async function audit(entry: BillingAuditEntry): Promise<void> {
    try {
      await deps.audit?.record(entry);
    } catch (error) {
      logger.error('billing_audit_failed', { business_id: entry.businessId, entity: entry.entity, error });
    }
  }

  function requireStripe(): { stripe: StripeClient; config: BillingConfig } {
    if (!deps.stripe || !deps.config) throw notConfigured('Stripe keys, prices or return URLs are missing');
    return { stripe: deps.stripe, config: deps.config };
  }

  async function customerFor(stripe: StripeClient, businessId: UUID, record: BillingRecord | null): Promise<string> {
    if (record) return record.stripeCustomerId;
    const contact = await repo.getBusinessContact(businessId);
    const created = await stripe.createCustomer({ businessId, ...contact, idempotencyKey: `customer:${businessId}` });
    return (await repo.saveCustomer(businessId, created.id)).stripeCustomerId;
  }

  /**
   * Two sessions must never both be payable: refuse when Stripe already shows a live subscription for the customer (our
   * row can lag a webhook), and expire every other open session once the new one exists.
   */
  async function assertNotSubscribedAtStripe(stripe: StripeClient, customerId: string): Promise<void> {
    const subs = await stripe.listSubscriptions(customerId);
    if (subs.some((sub) => accessFor(sub.status) === 'entitled')) {
      throw ruleViolation('ALREADY_SUBSCRIBED', 'This business already has a subscription: change or cancel it in the billing portal');
    }
  }

  async function expireOtherOpenSessions(stripe: StripeClient, customerId: string, keepId: string): Promise<void> {
    const open = await stripe.listOpenCheckoutSessions(customerId);
    await Promise.all(open.filter((session) => session.id !== keepId).map((session) => stripe.expireCheckoutSession(session.id)));
  }

  /** The fragment the checkout page reads: session, client secret, plan, base price, currency, business name, return URL. */
  async function checkoutPageUrl(page: string, session: { id: string; clientSecret: string }, input: { businessId: UUID; plan: PaidPlan; returnUrl?: string }): Promise<string> {
    const contact = await repo.getBusinessContact(input.businessId);
    const params = new URLSearchParams({
      s: session.id,
      cs: session.clientSecret,
      p: input.plan,
      a: String(PLAN_CATALOG[input.plan].priceCents),
      c: PLAN_CURRENCY,
      b: contact.name ?? '',
    });
    if (input.returnUrl) params.set('r', input.returnUrl);
    return `${page}/#${params.toString()}`;
  }

  async function createCheckout(input: { businessId: UUID; actorId: string; plan: PaidPlan; idempotencyKey: string; returnUrl?: string }) {
    const { stripe, config } = requireStripe();
    const priceId = priceIdFor(config, input.plan, 'ZAR');
    const usagePriceId = usagePriceFor(config, input.plan, 'ZAR');
    if (!priceId || !usagePriceId) throw notConfigured(`no base or usage price for ${input.plan}`, { plan: input.plan });
    const embedded = Boolean(config.checkoutPageUrl);
    if (!embedded && (!config.successUrl || !config.cancelUrl)) throw notConfigured('hosted checkout return URLs are missing');
    const record = await repo.getByBusiness(input.businessId);
    if (record?.stripeSubscriptionId && record.status && accessFor(record.status) === 'entitled') {
      throw ruleViolation('ALREADY_SUBSCRIBED', 'This business already has a subscription: change or cancel it in the billing portal');
    }
    const customerId = await customerFor(stripe, input.businessId, record);
    await assertNotSubscribedAtStripe(stripe, customerId);
    const session = await stripe.createCheckoutSession({
      customerId,
      priceId,
      usagePriceId,
      businessId: input.businessId,
      plan: input.plan,
      successUrl: config.successUrl,
      cancelUrl: config.cancelUrl,
      embedded,
      idempotencyKey: `checkout:${input.businessId}:${input.idempotencyKey}`,
    });
    await expireOtherOpenSessions(stripe, customerId, session.id);
    await audit({ businessId: input.businessId, actorId: input.actorId, action: 'insert', entity: 'billing_checkout', entityId: session.id, diff: { plan: input.plan, source: 'owner' } });
    if (config.checkoutPageUrl) {
      if (!session.clientSecret) throw new AppError('UPSTREAM_BILLING_ERROR', 'The payment provider returned no client secret');
      return { checkout_url: await checkoutPageUrl(config.checkoutPageUrl, { id: session.id, clientSecret: session.clientSecret }, input), session_id: session.id };
    }
    if (!session.url) throw new AppError('UPSTREAM_BILLING_ERROR', 'The payment provider returned no checkout url');
    return { checkout_url: session.url, session_id: session.id };
  }

  async function changePlan(input: { businessId: UUID; actorId: string; plan: PaidPlan; idempotencyKey: string }): Promise<SubscriptionDTO> {
    const { stripe, config } = requireStripe();
    const priceId = priceIdFor(config, input.plan, 'ZAR');
    const usagePriceId = usagePriceFor(config, input.plan, 'ZAR');
    if (!priceId || !usagePriceId) throw notConfigured(`no base or usage price for ${input.plan}`, { plan: input.plan });
    const record = await repo.getByBusiness(input.businessId);
    if (!record?.stripeSubscriptionId || !record.status || accessFor(record.status) !== 'entitled') {
      throw ruleViolation('NO_SUBSCRIPTION', 'There is no active subscription to change: start one with checkout');
    }
    if (record.plan === input.plan) throw ruleViolation('SAME_PLAN', 'The subscription is already on this plan');
    const current = await stripe.retrieveSubscription(record.stripeSubscriptionId);
    const baseItem = current.items.find((item) => planForPrice(config, item.priceId) !== null);
    if (!baseItem) throw new AppError('UPSTREAM_BILLING_ERROR', 'The subscription has no recognised plan line');
    const usageItem = current.items.find((item) => isUsagePrice(config, item.priceId));
    const updated = await stripe.changeSubscriptionPlan({
      subscriptionId: current.id,
      items: [{ id: baseItem.id, price: priceId }, { id: usageItem?.id ?? null, price: usagePriceId }],
      idempotencyKey: `plan:${input.businessId}:${input.idempotencyKey}`,
    });
    // Apply Stripe's answer now so the app sees the new plan at once; the webhook that follows finds nothing to change.
    await applySubscription({ ...updated, businessId: input.businessId }, Math.floor(clock().getTime() / 1000), { actorId: input.actorId, source: 'owner_api', ref: input.idempotencyKey });
    return (await getSubscription(input.businessId)) as SubscriptionDTO;
  }

  async function createPortal(businessId: UUID) {
    const { stripe, config } = requireStripe();
    const record = await repo.getByBusiness(businessId);
    if (!record) throw ruleViolation('NO_SUBSCRIPTION', 'There is no subscription to manage yet');
    const session = await stripe.createPortalSession({ customerId: record.stripeCustomerId, returnUrl: config.returnUrl });
    return { portal_url: session.url };
  }

  // ----- webhook handling -----

  /** Tells Nerova about a plan transition after the writes. Failures are the port's problem (best effort, reconciled daily). */
  function announce(businessId: UUID, before: PlanKey, after: PlanKey): void {
    if (before === after) return;
    const type = !isCompanionPlan(before) && isCompanionPlan(after) ? 'account.created' : isCompanionPlan(before) && !isCompanionPlan(after) ? 'account.removed' : 'account.updated';
    defer(() => deps.events.accountChanged(businessId, type));
  }

  /**
   * Mirrors plan and status to the Clerk organisation's publicMetadata so Clerk-side checks can read them. The database
   * stays the source of truth: a failure is logged (ids only) and never fails the webhook; the next subscription event
   * or a reconcile rewrites it.
   */
  function mirrorToClerk(businessId: UUID, plan: PlanKey, status: SubscriptionStatus | null, periodEnd: string | null): void {
    const clerk = deps.clerk;
    if (!clerk) return;
    const billingStatus = status === null ? 'none' : status === 'past_due' ? 'past_due' : status === 'active' || status === 'trialing' ? 'active' : 'canceled';
    defer(async () => {
      try {
        const orgId = await repo.getClerkOrgId(businessId);
        if (orgId) await clerk.updateOrganizationPublicMetadata(orgId, { plan, billingStatus, periodEnd });
      } catch (error) {
        logger.warn('billing_clerk_mirror_failed', { business_id: businessId, error });
      }
    });
  }

  async function resolveBusiness(sub: StripeSubscription): Promise<UUID | null> {
    if (sub.businessId) return sub.businessId;
    return (await repo.getBySubscription(sub.id))?.businessId ?? (await repo.getByCustomer(sub.customerId))?.businessId ?? null;
  }

  function tierOf(sub: StripeSubscription, record: BillingRecord | null) {
    const config = deps.config;
    const priced = config ? (sub.items.map((item) => planForPrice(config, item.priceId)).find((plan) => plan !== null) ?? null) : null;
    // The price wins: the portal can switch plans without touching the metadata we set at checkout.
    return priced ?? (isPaidPlan(sub.metadataPlan) ? sub.metadataPlan : null) ?? record?.plan ?? null;
  }

  interface Origin {
    actorId: string;
    source: 'stripe' | 'owner_api' | 'checkout_confirm';
    /** Stripe event id, the request's Idempotency-Key, or the Checkout Session id */
    ref: string;
  }

  async function applySubscription(sub: StripeSubscription, eventCreated: number, origin: Origin): Promise<BillingEventOutcome> {
    const businessId = await resolveBusiness(sub);
    if (!businessId) {
      logger.warn('billing_subscription_unlinked', { subscription_id: sub.id });
      return 'ignored';
    }
    const record = await repo.getByBusiness(businessId);
    const access = accessFor(sub.status);
    if (record?.lastEventAt && eventCreated * 1000 < Date.parse(record.lastEventAt)) return 'ignored';
    // A late event for a replaced subscription must not undo the current one.
    if (record?.stripeSubscriptionId && record.stripeSubscriptionId !== sub.id && access !== 'entitled') return 'ignored';

    const tier = tierOf(sub, record);
    if (access === 'entitled' && !tier) {
      logger.warn('billing_unknown_price', { subscription_id: sub.id, price_ids: sub.items.map((item) => item.priceId) });
      return 'ignored';
    }
    await repo.saveCustomer(businessId, sub.customerId);
    await repo.updateSubscription(businessId, {
      stripeSubscriptionId: sub.id,
      status: sub.status,
      plan: tier,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      lastEventAt: new Date(Math.max(eventCreated * 1000, record?.lastEventAt ? Date.parse(record.lastEventAt) : 0)).toISOString(),
      // Bookings made before the first activation are never metered (no history bill on day one).
      ...(access === 'entitled' && !record?.reportingStartedAt && { reportingStartedAt: new Date(eventCreated * 1000).toISOString() }),
    });
    if (access === 'unchanged') return 'processed';
    if (access === 'entitled' && tier) await syncUsagePrice(sub, tier);

    const before = await repo.getBusinessPlan(businessId);
    const after: PlanKey = access === 'entitled' && tier ? tier : 'none';
    if (before !== after) await repo.setBusinessPlan(businessId, after);
    announce(businessId, before, after);
    if (before !== after || record?.status !== sub.status || record?.stripeSubscriptionId !== sub.id) {
      await audit({
        businessId,
        actorId: origin.actorId,
        action: 'update',
        entity: 'billing_subscription',
        entityId: sub.id,
        diff: { source: origin.source, ref: origin.ref, plan_from: before, plan_to: after, status_from: record?.status ?? null, status_to: sub.status },
      });
    }
    mirrorToClerk(businessId, after, sub.status, sub.currentPeriodEnd);
    return 'processed';
  }

  /**
   * The plan is decided by the base price, so a portal plan change must swap the metered usage price too, or the
   * allowance (R0 tier) would stay the old plan's. A failure is logged for follow-up, not retried: it must not hold
   * back the entitlement change, and the next subscription event re-runs this.
   */
  async function syncUsagePrice(sub: StripeSubscription, tier: PaidPlan): Promise<void> {
    const { stripe, config } = deps;
    const expected = config ? usagePriceFor(config, tier, 'ZAR') : null;
    if (!stripe || !config || !expected) return;
    const current = sub.items.find((item) => isUsagePrice(config, item.priceId));
    if (current?.priceId === expected) return;
    try {
      await stripe.setSubscriptionUsagePrice({
        subscriptionId: sub.id,
        itemId: current?.id ?? null,
        priceId: expected,
        idempotencyKey: `usage-sync:${sub.id}:${tier}:${current?.id ?? 'none'}`,
      });
    } catch (error) {
      logger.error('billing_usage_price_sync_failed', { subscription_id: sub.id, plan: tier, error });
    }
  }

  const stripeOrigin = (event: StripeEvent): Origin => ({ actorId: '', source: 'stripe', ref: event.id });

  /** The one activation path: the webhook and the public confirm route both land here (idempotent, audited by applySubscription). */
  async function activateFromCheckout(input: { subscriptionId: string; businessId: UUID; at: number; origin: Origin }): Promise<BillingEventOutcome> {
    if (!deps.stripe) return 'ignored';
    const sub = await deps.stripe.retrieveSubscription(input.subscriptionId);
    return applySubscription({ ...sub, businessId: input.businessId }, input.at, input.origin);
  }

  async function onCheckoutCompleted(event: StripeEvent): Promise<BillingEventOutcome> {
    const session = event.object;
    const subscriptionId = refId(session.subscription);
    const businessId = asString(session.client_reference_id);
    if (session.mode !== 'subscription' || !subscriptionId || !businessId) return 'ignored';
    return activateFromCheckout({ subscriptionId, businessId: businessId as UUID, at: event.created, origin: stripeOrigin(event) });
  }

  async function confirmCheckout(sessionId: string): Promise<CheckoutConfirmation> {
    const { stripe } = requireStripe();
    const session = await stripe.retrieveCheckoutSession(sessionId);
    if (!session?.businessId || session.mode !== 'subscription') throw notFound('Checkout session');
    if (session.status === 'open') return { status: 'open' };
    if (session.status === 'expired') return { status: 'expired' };
    if (session.paymentStatus === 'unpaid' || !session.subscriptionId) return { status: 'processing' };
    // "Now" is right: the subscription was just read from Stripe, so it is at least as new as any webhook already received.
    await activateFromCheckout({
      subscriptionId: session.subscriptionId,
      businessId: session.businessId,
      at: Math.floor(clock().getTime() / 1000),
      origin: { actorId: '', source: 'checkout_confirm', ref: session.id },
    });
    const record = await repo.getByBusiness(session.businessId);
    const entitled = record?.stripeSubscriptionId === session.subscriptionId && record.status !== null && accessFor(record.status) === 'entitled';
    return entitled && record?.plan ? { status: 'active', plan: record.plan } : { status: 'processing' };
  }

  async function onSubscriptionEvent(event: StripeEvent): Promise<BillingEventOutcome> {
    const sub = parseSubscription(event.object);
    if (!sub) return 'ignored';
    // customer.subscription.deleted carries status canceled already; force it in case an old API version does not.
    return applySubscription(event.type === 'customer.subscription.deleted' ? { ...sub, status: 'canceled' } : sub, event.created, stripeOrigin(event));
  }

  async function onPaymentFailed(event: StripeEvent): Promise<BillingEventOutcome> {
    const invoice = event.object;
    const parent = asRecord(asRecord(invoice.parent).subscription_details);
    const subscriptionId = refId(invoice.subscription) ?? refId(parent.subscription);
    const record = subscriptionId ? await repo.getBySubscription(subscriptionId) : null;
    if (!record?.status || accessFor(record.status) !== 'entitled') return 'ignored';
    if (record.lastEventAt && event.created * 1000 < Date.parse(record.lastEventAt)) return 'ignored';
    // Access stays (see accessFor); the status makes the app warn the owner.
    await repo.updateSubscription(record.businessId, { status: 'past_due', lastEventAt: new Date(event.created * 1000).toISOString() });
    const plan = await repo.getBusinessPlan(record.businessId);
    await audit({
      businessId: record.businessId,
      actorId: '',
      action: 'update',
      entity: 'billing_subscription',
      entityId: record.stripeSubscriptionId ?? '',
      diff: { source: 'stripe', ref: event.id, plan_from: plan, plan_to: plan, status_from: record.status, status_to: 'past_due' },
    });
    mirrorToClerk(record.businessId, plan, 'past_due', record.currentPeriodEnd);
    return 'processed';
  }

  async function handleEvent(event: StripeEvent): Promise<BillingEventOutcome> {
    switch (event.type) {
      case 'checkout.session.completed':
        return onCheckoutCompleted(event);
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        return onSubscriptionEvent(event);
      case 'invoice.payment_failed':
        return onPaymentFailed(event);
      default:
        return 'ignored';
    }
  }

  // ----- usage metering: every booking made is one meter event -----

  const meterEvent = (booking: UnreportedBooking) =>
    deps.stripe?.createMeterEvent({
      eventName: deps.config?.meterEventName ?? 'booking_made',
      identifier: `booking:${booking.appointmentId}`,
      customerId: booking.stripeCustomerId,
      timestamp: new Date(booking.createdAt),
      value: 1,
    });

  /** Inline path right after a booking commits. Skips unless the business is subscribed and metering has started. */
  async function bookingCreated(booking: { appointmentId: UUID; businessId: UUID; createdAt: string }): Promise<void> {
    try {
      if (!deps.stripe) return;
      const record = await repo.getByBusiness(booking.businessId);
      const meterable = record?.status && accessFor(record.status) === 'entitled' && record.reportingStartedAt;
      if (!record || !meterable || booking.createdAt < (record.reportingStartedAt ?? '')) return;
      await meterEvent({ ...booking, stripeCustomerId: record.stripeCustomerId });
      await repo.markBookingsReported([booking.appointmentId], new Date());
    } catch (error) {
      // Never affects the booking: the sweep re-sends it (Stripe dedupes on the identifier).
      logger.warn('billing_meter_event_failed', { appointment_id: booking.appointmentId, business_id: booking.businessId, error });
    }
  }

  const SWEEP_CHUNK = 10;

  async function sweepUnreportedBookings(now: Date, opts: { limit?: number } = {}): Promise<ReportOutcome> {
    if (!deps.stripe || !deps.config) return { reported: 0, failed: 0, notConfigured: 1 };
    const pending = await repo.listUnreportedBookings({ createdAfter: new Date(now.getTime() - REPORT_HORIZON_MS), limit: opts.limit ?? 1000 });
    let reported = 0;
    let failed = 0;
    for (let i = 0; i < pending.length; i += SWEEP_CHUNK) {
      const chunk = pending.slice(i, i + SWEEP_CHUNK);
      const results = await Promise.allSettled(chunk.map((booking) => meterEvent(booking)));
      const sent: UUID[] = [];
      results.forEach((result, index) => {
        const booking = chunk[index] as UnreportedBooking;
        if (result.status === 'fulfilled') sent.push(booking.appointmentId);
        else {
          failed += 1;
          logger.warn('billing_meter_event_failed', { appointment_id: booking.appointmentId, business_id: booking.businessId, error: result.reason });
        }
      });
      if (sent.length > 0) await repo.markBookingsReported(sent, now);
      reported += sent.length;
    }
    return { reported, failed, notConfigured: 0 };
  }

  async function getSubscription(businessId: UUID): Promise<SubscriptionDTO | null> {
    const record = await repo.getByBusiness(businessId);
    if (!record?.stripeSubscriptionId) return null;
    return {
      status: record.status,
      plan: record.plan,
      current_period_end: record.currentPeriodEnd,
      cancel_at_period_end: record.cancelAtPeriodEnd,
      is_past_due: record.status === 'past_due',
    };
  }

  function isCheckoutAvailable(plan: PlanKey): boolean {
    return deps.stripe !== null && deps.config !== null && isPaidPlan(plan) && priceIdFor(deps.config, plan, 'ZAR') !== null && usagePriceFor(deps.config, plan, 'ZAR') !== null;
  }

  return { createCheckout, confirmCheckout, changePlan, createPortal, handleEvent, sweepUnreportedBookings, bookingCreated, getSubscription, isCheckoutAvailable };
}
