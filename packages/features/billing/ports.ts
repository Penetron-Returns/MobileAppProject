/** Billing ports: what the API and the usage service need from Stripe billing, and what the Stripe client and the repository must offer. */
import type { CheckoutSessionDTO, PlanKey, PortalSessionDTO, SubscriptionDTO, SubscriptionStatus, UUID } from '@booking/types';

/** Plans that can be bought */
export type PaidPlan = 'starter' | 'growth' | 'pro';
/** Prices exist per plan and currency so a USD price can be added without code changes (env only). */
export type BillingCurrency = 'ZAR' | 'USD';

export interface BillingConfig {
  /** Stripe price ids (recurring monthly, base fee only) */
  prices: Partial<Record<PaidPlan, Partial<Record<BillingCurrency, string>>>>;
  /**
   * Metered (graduated) price per plan: the plan's allowance at R0, then R4 per extra completed booking, driven by the
   * `meterEventName` meter. Checkout adds it next to the base price (no quantity).
   */
  usagePrices: Partial<Record<PaidPlan, Partial<Record<BillingCurrency, string>>>>;
  /** Stripe Billing Meter event name; the meter maps `stripe_customer_id` and sums `value` */
  meterEventName: string;
  successUrl: string;
  cancelUrl: string;
  /** Where the billing portal sends the owner back to */
  returnUrl: string;
}

// ---------- Stripe objects, normalised (no raw Stripe payloads cross the port) ----------
export interface StripeSubscription {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  /** Every line of the subscription: the base price and the metered usage price */
  items: { id: string; priceId: string | null }[];
  /** ISO-8601 UTC */
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** `metadata.business_id` we set at checkout */
  businessId: UUID | null;
  /** `metadata.plan` we set at checkout; the price wins because the portal can change it */
  metadataPlan: string | null;
}

export interface StripeClient {
  createCustomer(input: { businessId: UUID; name: string | null; email: string | null; idempotencyKey: string }): Promise<{ id: string }>;
  createCheckoutSession(input: {
    customerId: string;
    /** Base monthly price (quantity 1) */
    priceId: string;
    /** Metered usage price (no quantity) */
    usagePriceId: string;
    businessId: UUID;
    plan: PaidPlan;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }): Promise<{ id: string; url: string }>;
  /** Updates the subscription's lines in one call (both the base and the usage price) with proration; returns the result. */
  changeSubscriptionPlan(input: { subscriptionId: string; items: { id: string | null; price: string }[]; idempotencyKey: string }): Promise<StripeSubscription>;
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  retrieveSubscription(subscriptionId: string): Promise<StripeSubscription>;
  /** Points the subscription's usage line at `priceId`: swaps item `itemId`, or adds a line when it is null. No proration. */
  setSubscriptionUsagePrice(input: { subscriptionId: string; itemId: string | null; priceId: string; idempotencyKey: string }): Promise<void>;
  /**
   * One `POST /v1/billing/meter_events`. `identifier` makes it idempotent (Stripe dedupes on it); `timestamp` is the event
   * time (Stripe accepts up to 35 days back). Retries 5xx and 429 with backoff; an already-recorded identifier counts as success.
   */
  createMeterEvent(input: { eventName: string; identifier: string; customerId: string; timestamp: Date; value: number }): Promise<void>;
}

/** The slice of a Stripe event the service reads. `object` is `data.object`. */
export interface StripeEvent {
  id: string;
  type: string;
  /** Unix seconds */
  created: number;
  object: Record<string, unknown>;
}

export type BillingEventOutcome = 'processed' | 'ignored';

export interface BillingRecord {
  businessId: UUID;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  status: SubscriptionStatus | null;
  plan: PaidPlan | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  lastEventAt: string | null;
  /** Set when the business first became entitled: bookings that ended before it are never reported to the meter */
  reportingStartedAt: string | null;
}

/** A booking (any status) waiting to be sent to the meter */
export interface UnreportedBooking {
  appointmentId: UUID;
  businessId: UUID;
  stripeCustomerId: string;
  /** ISO-8601 UTC: the meter event time */
  createdAt: string;
}

export interface BillingRepository {
  getByBusiness(businessId: UUID): Promise<BillingRecord | null>;
  getByCustomer(customerId: string): Promise<BillingRecord | null>;
  getBySubscription(subscriptionId: string): Promise<BillingRecord | null>;
  /** Stores the customer for a business unless one exists; returns the row that won (race-safe). */
  saveCustomer(businessId: UUID, customerId: string): Promise<BillingRecord>;
  updateSubscription(businessId: UUID, patch: Partial<Omit<BillingRecord, 'businessId' | 'stripeCustomerId'>>): Promise<void>;
  /** Bookings created after `createdAfter`, not yet reported, of businesses with an entitled subscription (oldest first) */
  listUnreportedBookings(input: { createdAfter: Date; limit: number }): Promise<UnreportedBooking[]>;
  /** Stamps bookings as reported; returns how many were newly stamped */
  markBookingsReported(appointmentIds: UUID[], at: Date): Promise<number>;
  getBusinessContact(businessId: UUID): Promise<{ name: string | null; email: string | null }>;
  getBusinessPlan(businessId: UUID): Promise<PlanKey>;
  /** The Clerk organisation of the business (null when unknown) */
  getClerkOrgId(businessId: UUID): Promise<string | null>;
  /** Service-role write of `businesses.plan` */
  setBusinessPlan(businessId: UUID, plan: PlanKey): Promise<void>;
}

/** One audit_log entry. Ids, plans and statuses only: never a name, email or card detail. */
export interface BillingAuditEntry {
  businessId: UUID;
  /** The owner's user id, or '' for Stripe (recorded as the system actor) */
  actorId: string;
  action: 'insert' | 'update';
  entity: 'billing_checkout' | 'billing_subscription';
  entityId: string;
  diff: Record<string, unknown>;
}

export interface BillingAudit {
  record(entry: BillingAuditEntry): Promise<void>;
}

/** Owner-facing billing use cases and the webhook handler. */
export interface BillingService {
  createCheckout(input: { businessId: UUID; actorId: string; plan: PaidPlan; idempotencyKey: string }): Promise<CheckoutSessionDTO>;
  /** Moves an existing subscription to another paid plan (portal cannot: multi-item metered subscriptions) */
  changePlan(input: { businessId: UUID; actorId: string; plan: PaidPlan; idempotencyKey: string }): Promise<SubscriptionDTO>;
  createPortal(businessId: UUID): Promise<PortalSessionDTO>;
  /** Applies one verified Stripe event. Throws on a transient failure so Stripe retries. */
  handleEvent(event: StripeEvent): Promise<BillingEventOutcome>;
  /** Cron sweep: resends every booking of the last 34 days that has no billing_reported_at (Stripe dedupes on the identifier) */
  sweepUnreportedBookings(now: Date, opts?: { limit?: number }): Promise<ReportOutcome>;
}

/** Called by BookingService after a booking commits. Never throws; failures are left to the sweep. */
export interface BookingMeter {
  bookingCreated(booking: { appointmentId: UUID; businessId: UUID; createdAt: string }): Promise<void>;
}

export interface ReportOutcome {
  reported: number;
  failed: number;
  /** 1 when Stripe is not configured and nothing was attempted */
  notConfigured: number;
}

/** What the plan listing needs (kept separate from BillingService: interface segregation). */
export interface BillingSummary {
  /** True when checkout can start `plan` right now */
  isCheckoutAvailable(plan: PlanKey): boolean;
  getSubscription(businessId: UUID): Promise<SubscriptionDTO | null>;
}
