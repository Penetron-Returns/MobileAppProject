/** Supabase BillingRepository (service role). Every query is scoped by business, customer or subscription id of that business's row. */
import type { SubscriptionStatus, UUID } from '@booking/types';
import type { Db } from '../../lib/db.ts';
import { mapDbError, notFound } from '../../lib/errors.ts';
import { isPaidPlan } from '../lib/policy.ts';
import type { BillingRecord, BillingRepository } from '../ports.ts';

const COLUMNS =
  'business_id, stripe_customer_id, stripe_subscription_id, status, plan, current_period_end, cancel_at_period_end, last_event_at, reporting_started_at, scheduled_plan, scheduled_at';

interface Row {
  business_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  status: string | null;
  plan: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  last_event_at: string | null;
  reporting_started_at: string | null;
  scheduled_plan: string | null;
  scheduled_at: string | null;
}

const toRecord = (row: Row): BillingRecord => ({
  businessId: row.business_id,
  stripeCustomerId: row.stripe_customer_id,
  stripeSubscriptionId: row.stripe_subscription_id,
  status: row.status as SubscriptionStatus | null,
  plan: isPaidPlan(row.plan) ? row.plan : null,
  currentPeriodEnd: row.current_period_end,
  cancelAtPeriodEnd: row.cancel_at_period_end,
  lastEventAt: row.last_event_at,
  reportingStartedAt: row.reporting_started_at,
  scheduledPlan: isPaidPlan(row.scheduled_plan) ? row.scheduled_plan : null,
  scheduledAt: row.scheduled_at,
});

export function createSupabaseBillingRepository(db: Db): BillingRepository {
  async function find(column: 'business_id' | 'stripe_customer_id' | 'stripe_subscription_id', value: string): Promise<BillingRecord | null> {
    const { data, error } = await db.from('billing_subscriptions').select(COLUMNS).eq(column, value).maybeSingle();
    if (error) throw mapDbError(error);
    return data ? toRecord(data as Row) : null;
  }

  return {
    getByBusiness: (businessId) => find('business_id', businessId),
    getByCustomer: (customerId) => find('stripe_customer_id', customerId),
    getBySubscription: (subscriptionId) => find('stripe_subscription_id', subscriptionId),
    async saveCustomer(businessId, customerId) {
      // Insert-if-absent, then read: two racing checkouts converge on whichever row landed first.
      const { error } = await db
        .from('billing_subscriptions')
        .upsert({ business_id: businessId, stripe_customer_id: customerId }, { onConflict: 'business_id', ignoreDuplicates: true });
      if (error) throw mapDbError(error);
      const row = await find('business_id', businessId);
      if (!row) throw notFound('Billing record');
      return row;
    },
    async updateSubscription(businessId, patch) {
      const values = {
        ...(patch.stripeSubscriptionId !== undefined && { stripe_subscription_id: patch.stripeSubscriptionId }),
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.plan !== undefined && { plan: patch.plan }),
        ...(patch.currentPeriodEnd !== undefined && { current_period_end: patch.currentPeriodEnd }),
        ...(patch.cancelAtPeriodEnd !== undefined && { cancel_at_period_end: patch.cancelAtPeriodEnd }),
        ...(patch.lastEventAt !== undefined && { last_event_at: patch.lastEventAt }),
        ...(patch.reportingStartedAt !== undefined && { reporting_started_at: patch.reportingStartedAt }),
        ...(patch.scheduledPlan !== undefined && { scheduled_plan: patch.scheduledPlan }),
        ...(patch.scheduledAt !== undefined && { scheduled_at: patch.scheduledAt }),
      };
      const { error } = await db.from('billing_subscriptions').update(values).eq('business_id', businessId);
      if (error) throw mapDbError(error);
    },
    async listUnreportedBookings({ createdAfter, limit }) {
      const { data, error } = await db.rpc('billing_unreported_bookings', { p_created_after: createdAfter.toISOString(), p_limit: limit });
      if (error) throw mapDbError(error);
      return (data ?? []).map((row) => ({
        appointmentId: row.appointment_id,
        businessId: row.business_id,
        stripeCustomerId: row.stripe_customer_id,
        createdAt: row.created_at,
      }));
    },
    async markBookingsReported(appointmentIds, at) {
      if (appointmentIds.length === 0) return 0;
      const { data, error } = await db.rpc('mark_bookings_billed', { p_ids: appointmentIds, p_at: at.toISOString() });
      if (error) throw mapDbError(error);
      return data ?? 0;
    },
    async getBusinessContact(businessId: UUID) {
      const { data, error } = await db.from('businesses').select('name, email').eq('id', businessId).maybeSingle();
      if (error) throw mapDbError(error);
      if (!data) throw notFound('Business');
      return { name: data.name, email: data.email };
    },
    async getBusinessPlan(businessId) {
      const { data, error } = await db.from('businesses').select('plan').eq('id', businessId).maybeSingle();
      if (error) throw mapDbError(error);
      if (!data) throw notFound('Business');
      return data.plan;
    },
    async getClerkOrgId(businessId) {
      const { data, error } = await db.from('businesses').select('clerk_org_id').eq('id', businessId).maybeSingle();
      if (error) throw mapDbError(error);
      return data?.clerk_org_id ?? null;
    },
    async setBusinessPlan(businessId, plan) {
      const { error } = await db.from('businesses').update({ plan }).eq('id', businessId);
      if (error) throw mapDbError(error);
    },
  };
}
