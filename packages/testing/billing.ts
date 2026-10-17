/** In-memory BillingRepository and a recording fake StripeClient. They honour the real contracts (see ports.ts). */
import type { PlanKey, UUID } from '@booking/types';
import type { BillingRecord, BillingRepository, StripeClient, StripeSubscription, UnreportedBooking } from '@booking/features/billing/ports.ts';
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
  sessions: { customerId: string; priceId: string; usagePriceId: string; plan: string; businessId: UUID; successUrl: string; cancelUrl: string; idempotencyKey: string }[];
  portals: { customerId: string; returnUrl: string }[];
  planChanges: { subscriptionId: string; items: { id: string | null; price: string }[] }[];
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
  const planChanges: FakeStripe['planChanges'] = [];
  const subscriptions = new Map<string, StripeSubscription>();
  const fake: FakeStripe = {
    customers,
    sessions,
    portals,
    usageSwaps,
    planChanges,
    meterEvents: new Map(),
    meterCalls: 0,
    failMeterEvents: 0,
    subscriptions,
    async createCustomer({ businessId, idempotencyKey }) {
      const existing = customers.find((c) => c.idempotencyKey === idempotencyKey);
      if (existing) return { id: existing.id };
      const id = `cus_${customers.length + 1}`;
      customers.push({ id, businessId, idempotencyKey });
      return { id };
    },
    async createCheckoutSession(input) {
      const existing = sessions.findIndex((s) => s.idempotencyKey === input.idempotencyKey);
      if (existing >= 0) return { id: `cs_${existing + 1}`, url: `https://checkout.test/cs_${existing + 1}` };
      sessions.push(input);
      return { id: `cs_${sessions.length}`, url: `https://checkout.test/cs_${sessions.length}` };
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
    async changeSubscriptionPlan({ subscriptionId, items }) {
      const existing = subscriptions.get(subscriptionId);
      if (!existing) throw notFound('Subscription');
      planChanges.push({ subscriptionId, items });
      const updated: StripeSubscription = { ...existing, items: items.map((item, i) => ({ id: item.id ?? `si_new_${i}`, priceId: item.price })) };
      subscriptions.set(subscriptionId, updated);
      return updated;
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
