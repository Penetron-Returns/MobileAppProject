/** In-memory BillingRepository and a recording fake StripeClient. They honour the real contracts (see ports.ts). */
import type { PlanKey, UUID } from '@booking/types';
import type { BillingRecord, BillingRepository, PlanChangeItem, StripeCheckoutSession, StripeClient, StripeSubscription, UnreportedBooking, UpgradePayment, UpgradeResult } from '@booking/features/billing/ports.ts';
import { notFound } from '@booking/features/lib/errors.ts';

export interface MemoryBooking {
  id: UUID;
  businessId: UUID;
  /** ISO-8601 UTC */
  createdAt: string;
  /** Any status counts; kept only so tests read naturally */
  status?: string;
  reportedAt?: string | null;
}

export interface MemoryBillingRepository extends BillingRepository {
  bookings: MemoryBooking[];
  records: Map<UUID, BillingRecord>;
  plans: Map<UUID, PlanKey>;
  /** Every setBusinessPlan call, in order */
  planWrites: { businessId: UUID; plan: PlanKey }[];
}

export function createMemoryBillingRepository(
  businesses: Record<UUID, { plan?: PlanKey; name?: string; email?: string | null }> = {},
  bookings: MemoryBooking[] = [],
): MemoryBillingRepository {
  const records = new Map<UUID, BillingRecord>();
  const plans = new Map<UUID, PlanKey>(Object.entries(businesses).map(([id, b]) => [id, b.plan ?? 'none']));
  const planWrites: { businessId: UUID; plan: PlanKey }[] = [];
  const findBy = (pick: (r: BillingRecord) => string | null, value: string) => [...records.values()].find((r) => pick(r) === value) ?? null;
  const known = (businessId: UUID) => {
    if (!plans.has(businessId)) throw notFound('Business');
  };
  return {
    bookings,
    records,
    plans,
    planWrites,
    async getByBusiness(businessId) {
      return records.get(businessId) ?? null;
    },
    async getByCustomer(customerId) {
      return findBy((r) => r.stripeCustomerId, customerId);
    },
    async getBySubscription(subscriptionId) {
      return findBy((r) => r.stripeSubscriptionId, subscriptionId);
    },
    async saveCustomer(businessId, customerId) {
      known(businessId);
      const existing = records.get(businessId);
      if (existing) return existing;
      const created: BillingRecord = {
        businessId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: null,
        status: null,
        plan: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        lastEventAt: null,
        reportingStartedAt: null,
        scheduledPlan: null,
        scheduledAt: null,
      };
      records.set(businessId, created);
      return created;
    },
    async updateSubscription(businessId, patch) {
      const record = records.get(businessId);
      if (!record) throw notFound('Billing record');
      records.set(businessId, { ...record, ...patch });
    },
    /** Mirrors billing_unreported_bookings(): entitled subscription, created after the horizon and not before reporting started */
    async listUnreportedBookings({ createdAfter, limit }) {
      const rows: UnreportedBooking[] = [];
      for (const b of bookings) {
        const record = records.get(b.businessId);
        const entitled = record?.status === 'active' || record?.status === 'trialing' || record?.status === 'past_due';
        if (!record || !entitled || !record.reportingStartedAt || b.reportedAt) continue;
        if (Date.parse(b.createdAt) <= createdAfter.getTime() || b.createdAt < record.reportingStartedAt) continue;
        rows.push({ appointmentId: b.id, businessId: b.businessId, stripeCustomerId: record.stripeCustomerId, createdAt: b.createdAt });
      }
      return rows.sort((x, y) => x.createdAt.localeCompare(y.createdAt) || x.appointmentId.localeCompare(y.appointmentId)).slice(0, limit);
    },
    async markBookingsReported(ids, at) {
      let stamped = 0;
      for (const b of bookings) {
        if (ids.includes(b.id) && !b.reportedAt) {
          b.reportedAt = at.toISOString();
          stamped += 1;
        }
      }
      return stamped;
    },
    async getBusinessContact(businessId) {
      known(businessId);
      const b = businesses[businessId];
      return { name: b?.name ?? null, email: b?.email ?? null };
    },
    async getBusinessPlan(businessId) {
      known(businessId);
      return plans.get(businessId) as PlanKey;
    },
    async getClerkOrgId(businessId) {
      known(businessId);
      return `org_${businessId}`;
    },
    async setBusinessPlan(businessId, plan) {
      known(businessId);
      plans.set(businessId, plan);
      planWrites.push({ businessId, plan });
    },
  };
}

export interface FakeStripe extends StripeClient {
  customers: { id: string; businessId: UUID; idempotencyKey: string }[];
  sessions: { customerId: string; priceId: string; usagePriceId: string; plan: string; businessId: UUID; successUrl: string; cancelUrl: string; embedded?: boolean; idempotencyKey: string }[];
  /** Checkout Sessions by id with their status, as Stripe holds them (created by createCheckoutSession) */
  checkoutSessions: Map<string, StripeCheckoutSession & { customerId: string }>;
  /** Ids passed to expireCheckoutSession, in order */
  expired: string[];
  portals: { customerId: string; returnUrl: string }[];
  /** Every real (non-replayed) upgradeSubscriptionPlan call */
  upgrades: { subscriptionId: string; items: PlanChangeItem[]; prorationDate: number; idempotencyKey: string }[];
  /** How the next upgrade's proration invoice ends: paid (default), needs 3DS, or declined. Sticky until changed. */
  upgradePayment: UpgradePayment;
  /** Every previewUpgrade call, and the amount it answers (cents) */
  previews: { subscriptionId: string; items: PlanChangeItem[]; prorationDate: number }[];
  previewAmountCents: number;
  /** Invoices passed to voidInvoice */
  voidedInvoices: string[];
  /** Subscription Schedules Stripe holds (id -> what they will switch to); released ones are removed */
  schedules: Map<string, { subscriptionId: string; items: { price: string; quantity?: number }[]; idempotencyKey: string }>;
  releasedSchedules: string[];
  usageSwaps: { subscriptionId: string; itemId: string | null; priceId: string }[];
  /** Meter events Stripe holds, one per identifier (a repeat is deduplicated, like Stripe) */
  meterEvents: Map<string, { eventName: string; customerId: string; timestamp: string; value: number }>;
  /** Every createMeterEvent call, including repeats */
  meterCalls: number;
  /** The next N createMeterEvent calls fail (simulates a Stripe outage) */
  failMeterEvents: number;
  /** Subscriptions retrieveSubscription can return, by id */
  subscriptions: Map<string, StripeSubscription>;
}

/** Records calls and replays the same result for a repeated idempotency key, like Stripe does. */
export function createFakeStripe(): FakeStripe {
  const customers: FakeStripe['customers'] = [];
  const sessions: FakeStripe['sessions'] = [];
  const portals: FakeStripe['portals'] = [];
  const usageSwaps: FakeStripe['usageSwaps'] = [];
  const upgrades: FakeStripe['upgrades'] = [];
  const schedules: FakeStripe['schedules'] = new Map();
  const upgradeResults = new Map<string, UpgradeResult>();
  const subscriptions = new Map<string, StripeSubscription>();
  const checkoutSessions: FakeStripe['checkoutSessions'] = new Map();
  const expired: string[] = [];
  const fake: FakeStripe = {
    customers,
    sessions,
    portals,
    usageSwaps,
    upgrades,
    upgradePayment: 'paid',
    previews: [],
    previewAmountCents: 60_000,
    voidedInvoices: [],
    schedules,
    releasedSchedules: [],
    meterEvents: new Map(),
    meterCalls: 0,
    failMeterEvents: 0,
    subscriptions,
    checkoutSessions,
    expired,
    async createCustomer({ businessId, idempotencyKey }) {
      const existing = customers.find((c) => c.idempotencyKey === idempotencyKey);
      if (existing) return { id: existing.id };
      const id = `cus_${customers.length + 1}`;
      customers.push({ id, businessId, idempotencyKey });
      return { id };
    },
    async createCheckoutSession(input) {
      let index = sessions.findIndex((s) => s.idempotencyKey === input.idempotencyKey);
      if (index < 0) {
        sessions.push(input);
        index = sessions.length - 1;
        checkoutSessions.set(`cs_test_${index + 1}`, { id: `cs_test_${index + 1}`, customerId: input.customerId, status: 'open', paymentStatus: 'unpaid', mode: 'subscription', subscriptionId: null, businessId: input.businessId, created: 0 });
      }
      const id = `cs_test_${index + 1}`;
      return { id, url: input.embedded ? null : `https://checkout.test/${id}`, clientSecret: input.embedded ? `${id}_secret_abc` : null };
    },
    async listOpenCheckoutSessions(customerId) {
      return [...checkoutSessions.values()].filter((s) => s.customerId === customerId && s.status === 'open').map((s) => ({ id: s.id }));
    },
    async expireCheckoutSession(sessionId) {
      expired.push(sessionId);
      const session = checkoutSessions.get(sessionId);
      if (session?.status === 'open') session.status = 'expired';
    },
    async listSubscriptions(customerId) {
      return [...subscriptions.values()].filter((s) => s.customerId === customerId);
    },
    async retrieveCheckoutSession(sessionId) {
      const session = checkoutSessions.get(sessionId);
      if (!session) return null;
      const { customerId: _customerId, ...rest } = session;
      return rest;
    },
    async createPortalSession(input) {
      portals.push(input);
      return { url: `https://portal.test/${input.customerId}` };
    },
    async retrieveSubscription(id) {
      const sub = subscriptions.get(id);
      if (!sub) throw notFound('Subscription');
      return sub;
    },
    async previewUpgrade(input) {
      if (!subscriptions.has(input.subscriptionId)) throw notFound('Subscription');
      fake.previews.push(input);
      return { amountDueCents: fake.previewAmountCents, currency: 'ZAR' };
    },
    /** Like Stripe with pending_if_incomplete: the new prices apply only when the proration invoice is paid; a repeated key replays the first answer */
    async upgradeSubscriptionPlan({ subscriptionId, items, prorationDate, idempotencyKey }) {
      const replay = upgradeResults.get(idempotencyKey);
      if (replay) return replay;
      const existing = subscriptions.get(subscriptionId);
      if (!existing) throw notFound('Subscription');
      upgrades.push({ subscriptionId, items, prorationDate, idempotencyKey });
      const payment = fake.upgradePayment;
      const invoiceId = `in_upgrade_${upgrades.length}`;
      let subscription = existing;
      if (payment === 'paid') {
        subscription = { ...existing, items: items.map((item, i) => ({ id: item.id ?? `si_new_${i}`, priceId: item.price })) };
        subscriptions.set(subscriptionId, subscription);
      }
      const result: UpgradeResult = { subscription, payment, invoiceId, hostedInvoiceUrl: payment === 'paid' ? null : `https://invoice.test/${invoiceId}` };
      upgradeResults.set(idempotencyKey, result);
      return result;
    },
    async voidInvoice(invoiceId) {
      fake.voidedInvoices.push(invoiceId);
    },
    async scheduleDowngrade({ subscriptionId, items, idempotencyKey }) {
      const existing = subscriptions.get(subscriptionId);
      if (!existing) throw notFound('Subscription');
      const replay = [...schedules].find(([, schedule]) => schedule.idempotencyKey === idempotencyKey);
      if (replay) return { scheduleId: replay[0] };
      const scheduleId = `sub_sched_${schedules.size + fake.releasedSchedules.length + 1}`;
      schedules.set(scheduleId, { subscriptionId, items, idempotencyKey });
      subscriptions.set(subscriptionId, { ...existing, scheduleId });
      return { scheduleId };
    },
    async releaseSchedule(scheduleId) {
      const schedule = schedules.get(scheduleId);
      if (!schedule) return;
      schedules.delete(scheduleId);
      fake.releasedSchedules.push(scheduleId);
      const existing = subscriptions.get(schedule.subscriptionId);
      if (existing) subscriptions.set(schedule.subscriptionId, { ...existing, scheduleId: null });
    },
    async setSubscriptionUsagePrice({ subscriptionId, itemId, priceId }) {
      usageSwaps.push({ subscriptionId, itemId, priceId });
    },
    async createMeterEvent({ eventName, identifier, customerId, timestamp, value }) {
      fake.meterCalls += 1;
      if (fake.failMeterEvents > 0) {
        fake.failMeterEvents -= 1;
        throw new Error('stripe unavailable');
      }
      if (!fake.meterEvents.has(identifier)) fake.meterEvents.set(identifier, { eventName, customerId, timestamp: timestamp.toISOString(), value });
    },
  };
  return fake;
}
