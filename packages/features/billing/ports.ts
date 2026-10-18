/** Billing ports: what the API and the usage service need from Stripe billing, and what the Stripe client and the repository must offer. */
import type { ChangePlanResultDTO, CheckoutSessionDTO, PlanChangePreviewDTO, PlanKey, PortalSessionDTO, SubscriptionDTO, SubscriptionStatus, UUID } from '@booking/types';

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
  /** Hosted Checkout return URLs (empty when only the embedded checkout page is configured) */
  successUrl: string;
  cancelUrl: string;
  /** Where the billing portal sends the owner back to */
  returnUrl: string;
  /** Our own checkout page (CHECKOUT_PAGE_URL, no trailing slash). Set = embedded_page sessions; unset = hosted Checkout. */
  checkoutPageUrl?: string | undefined;
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
  /** The Subscription Schedule attached to it (a scheduled downgrade); null / absent when there is none */
  scheduleId?: string | null;
}

/** One line of a plan change: an existing item to re-price, or a new one (id null). Licensed lines carry quantity 1, metered lines none. */
export interface PlanChangeItem {
  id: string | null;
  price: string;
  quantity?: number;
}

/** How the proration invoice of an upgrade ended */
export type UpgradePayment = 'paid' | 'requires_action' | 'failed';

export interface UpgradeResult {
  /** The subscription as Stripe holds it after the call (new prices only when the invoice was paid) */
  subscription: StripeSubscription;
  payment: UpgradePayment;
  /** The proration invoice; null when Stripe created none (nothing to charge) */
  invoiceId: string | null;
  /** Where the customer pays or authenticates; set for requires_action */
  hostedInvoiceUrl: string | null;
}

/** The slice of a Checkout Session the confirm route reads (no customer details) */
export interface StripeCheckoutSession {
  id: string;
  status: 'open' | 'complete' | 'expired';
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required';
  mode: string | null;
  subscriptionId: string | null;
  /** `metadata.business_id` / `client_reference_id` we set at checkout */
  businessId: UUID | null;
  /** Unix seconds */
  created: number;
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
    /** Hosted mode: where Stripe redirects. Embedded mode ignores both (redirect_on_completion 'never'). */
    successUrl: string;
    cancelUrl: string;
    /** True = `ui_mode: 'embedded_page'` rendered on our checkout page; the result carries `clientSecret` */
    embedded?: boolean;
    idempotencyKey: string;
  }): Promise<{ id: string; url: string | null; clientSecret: string | null }>;
  /** Checkout Sessions of the customer that are still payable (status `open`) */
  listOpenCheckoutSessions(customerId: string): Promise<{ id: string }[]>;
  /** Expires an open session; a session that is no longer open is not an error */
  expireCheckoutSession(sessionId: string): Promise<void>;
  /** Every subscription Stripe holds for the customer (all statuses Stripe lists) */
  listSubscriptions(customerId: string): Promise<StripeSubscription[]>;
  /** Null when Stripe does not know the session */
  retrieveCheckoutSession(sessionId: string): Promise<StripeCheckoutSession | null>;
  /**
   * The proration delta an upgrade would charge now (`POST /v1/invoices/create_preview`, always_invoice, at `prorationDate`).
   * Creates nothing at Stripe. `currency` is upper case.
   */
  previewUpgrade(input: { subscriptionId: string; items: PlanChangeItem[]; prorationDate: number }): Promise<{ amountDueCents: number; currency: string }>;
  /**
   * Switches the lines of the subscription now (base and usage price together) and invoices the proration at once with
   * `payment_behavior: pending_if_incomplete`: Stripe applies the new prices only when that invoice is paid. The outcome tells
   * which of paid, needs-authentication and declined happened. `prorationDate` (unix seconds) pins the amount to the preview.
   */
  upgradeSubscriptionPlan(input: { subscriptionId: string; items: PlanChangeItem[]; prorationDate: number; idempotencyKey: string }): Promise<UpgradeResult>;
  /** Voids an open invoice (which also discards the pending update behind it). An invoice that is no longer open is not an error. */
  voidInvoice(invoiceId: string): Promise<void>;
  /**
   * Schedules `items` (new base price qty 1 and usage price) to replace the current prices when the current period ends, via a
   * Subscription Schedule, with no proration and nothing changing now. Returns the schedule id.
   */
  scheduleDowngrade(input: { subscriptionId: string; items: { price: string; quantity?: number }[]; idempotencyKey: string }): Promise<{ scheduleId: string }>;
  /** Releases a Subscription Schedule: the subscription keeps its current prices and the future phases are dropped. Already released is not an error. */
  releaseSchedule(scheduleId: string): Promise<void>;
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
  /** A downgrade scheduled for the end of the paid period (the plan above stays until then); null when none */
  scheduledPlan: PaidPlan | null;
  /** ISO-8601 UTC: the period end `scheduledPlan` was scheduled for */
  scheduledAt: string | null;
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
  createCheckout(input: { businessId: UUID; actorId: string; plan: PaidPlan; idempotencyKey: string; returnUrl?: string }): Promise<CheckoutSessionDTO>;
  /**
   * Public confirm: verifies the session with Stripe and, when paid, activates the plan through the same path as the
   * `checkout.session.completed` webhook (idempotent either way round). Throws NOT_FOUND for an unknown or foreign session.
   */
  confirmCheckout(sessionId: string): Promise<CheckoutConfirmation>;
  /**
   * Moves an existing subscription to another paid plan (the portal cannot: multi-item metered subscriptions). An upgrade is
   * invoiced now and only applied when paid; a downgrade is scheduled for the period end; the current plan cancels a
   * scheduled downgrade. A declined card throws PAYMENT_FAILED and changes nothing.
   */
  changePlan(input: { businessId: UUID; actorId: string; plan: PaidPlan; idempotencyKey: string; prorationDate?: number }): Promise<ChangePlanResultDTO>;
  /** What `changePlan` to `plan` would charge and when it takes effect. Read-only. */
  previewPlanChange(input: { businessId: UUID; plan: PaidPlan }): Promise<PlanChangePreviewDTO>;
  createPortal(businessId: UUID): Promise<PortalSessionDTO>;
  /** Applies one verified Stripe event. Throws on a transient failure so Stripe retries. */
  handleEvent(event: StripeEvent): Promise<BillingEventOutcome>;
  /** Cron sweep: resends every booking of the last 34 days that has no billing_reported_at (Stripe dedupes on the identifier) */
  sweepUnreportedBookings(now: Date, opts?: { limit?: number }): Promise<ReportOutcome>;
}

export type CheckoutConfirmation = { status: 'active'; plan: PaidPlan } | { status: 'processing' | 'open' | 'expired' };

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
