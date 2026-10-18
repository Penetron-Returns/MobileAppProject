/**
 * Plan changes on an existing subscription, split from billingService (one reason to change: how Stripe is asked to move
 * a subscription between plans).
 *  - upgrade: invoiced now at a pinned proration date with `pending_if_incomplete`, so Stripe applies the new prices only
 *    if that invoice is paid; our plan flips through the same applySubscription path as the webhooks.
 *  - downgrade: a Subscription Schedule moves the prices at the period end; nothing changes now.
 *  - choosing the current plan while a downgrade is scheduled cancels the downgrade.
 */
import type { ChangePlanResultDTO, PlanChangePreviewDTO, UUID } from '@booking/types';
import { AppError, ruleViolation } from '../../lib/errors.ts';
import type { Logger } from '../../lib/logger.ts';
import { PLAN_CATALOG, PLAN_CURRENCY } from '../../plans/lib/planCatalog.ts';
import { PRORATION_DATE_MAX_AGE_SECONDS, accessFor, changeDirection, isUsagePrice, planForPrice, priceIdFor, usagePriceFor } from '../lib/policy.ts';
import type { BillingAuditEntry, BillingConfig, BillingRecord, BillingRepository, PaidPlan, PlanChangeItem, StripeClient, StripeSubscription } from '../ports.ts';

export interface PlanChangeDeps {
  /** Throws BILLING_NOT_CONFIGURED when Stripe or the prices are missing */
  requireStripe(): { stripe: StripeClient; config: BillingConfig };
  repo: BillingRepository;
  clock: () => Date;
  logger: Logger;
  audit(entry: BillingAuditEntry): Promise<void>;
  /** Applies a subscription Stripe just returned to our tables, exactly like a webhook would (idempotent, audited) */
  applyOwnerChange(sub: StripeSubscription, input: { businessId: UUID; actorId: string; ref: string; at: number }): Promise<void>;
  notConfigured(what: string, details?: Record<string, unknown>): AppError;
}

interface Target {
  plan: PaidPlan;
  record: BillingRecord & { stripeSubscriptionId: string };
  current: PaidPlan;
  stripe: StripeClient;
  config: BillingConfig;
}

interface Caller {
  businessId: UUID;
  actorId: string;
  /** The request's Idempotency-Key */
  key: string;
}

export function createPlanChange(deps: PlanChangeDeps) {
  const { repo } = deps;
  const nowSeconds = () => Math.floor(deps.clock().getTime() / 1000);

  async function resolve(businessId: UUID, plan: PaidPlan): Promise<Target> {
    const { stripe, config } = deps.requireStripe();
    if (!priceIdFor(config, plan, 'ZAR') || !usagePriceFor(config, plan, 'ZAR')) throw deps.notConfigured(`no base or usage price for ${plan}`, { plan });
    const record = await repo.getByBusiness(businessId);
    if (!record?.stripeSubscriptionId || !record.status || !record.plan || accessFor(record.status) !== 'entitled') {
      throw ruleViolation('NO_SUBSCRIPTION', 'There is no active subscription to change: start one with checkout');
    }
    return { plan, record: { ...record, stripeSubscriptionId: record.stripeSubscriptionId }, current: record.plan, stripe, config };
  }

  /** Both lines of the target plan, re-pricing the subscription's existing base and usage items */
  function targetItems({ plan, config }: Target, sub: StripeSubscription): PlanChangeItem[] {
    const baseItem = sub.items.find((item) => planForPrice(config, item.priceId) !== null);
    if (!baseItem) throw new AppError('UPSTREAM_BILLING_ERROR', 'The subscription has no recognised plan line');
    const usageItem = sub.items.find((item) => isUsagePrice(config, item.priceId));
    return [
      { id: baseItem.id, price: priceIdFor(config, plan, 'ZAR') as string, quantity: 1 },
      { id: usageItem?.id ?? null, price: usagePriceFor(config, plan, 'ZAR') as string },
    ];
  }

  async function previewPlanChange(input: { businessId: UUID; plan: PaidPlan }): Promise<PlanChangePreviewDTO> {
    const target = await resolve(input.businessId, input.plan);
    const direction = changeDirection(target.current, input.plan);
    const now = deps.clock();
    const base = {
      direction,
      plan: input.plan,
      current_plan: target.current,
      currency: PLAN_CURRENCY,
      next_amount_cents: PLAN_CATALOG[input.plan].priceCents,
      next_billing_at: target.record.currentPeriodEnd,
    };
    if (direction === 'downgrade') {
      return { ...base, amount_due_now_cents: 0, effective_at: target.record.currentPeriodEnd ?? now.toISOString(), proration_date: null };
    }
    if (direction === 'same') return { ...base, amount_due_now_cents: 0, effective_at: now.toISOString(), proration_date: null };
    const sub = await target.stripe.retrieveSubscription(target.record.stripeSubscriptionId);
    const prorationDate = nowSeconds();
    const quote = await target.stripe.previewUpgrade({ subscriptionId: sub.id, items: targetItems(target, sub), prorationDate });
    return { ...base, currency: quote.currency, amount_due_now_cents: Math.max(0, quote.amountDueCents), effective_at: now.toISOString(), proration_date: prorationDate };
  }

  /** audit_log entry for a plan change that did not move the plan itself (scheduled, schedule cancelled, 3DS, decline) */
  const auditAttempt = (target: Target, who: Caller, outcome: string, extra: Record<string, unknown> = {}) =>
    deps.audit({
      businessId: who.businessId,
      actorId: who.actorId,
      action: 'update',
      entity: 'billing_subscription',
      entityId: target.record.stripeSubscriptionId,
      diff: { source: 'owner_api', ref: who.key, plan_from: target.current, plan_to: target.current, requested_plan: target.plan, outcome, ...extra },
    });

  /** The newest-event marker moves to now (whole seconds, like Stripe's `created`) so an older queued webhook cannot undo the write */
  const eventMarker = (record: BillingRecord): string =>
    new Date(Math.max(nowSeconds() * 1000, record.lastEventAt ? Date.parse(record.lastEventAt) : 0)).toISOString();

  async function releaseScheduleOf(target: Target, sub: StripeSubscription, who: Caller): Promise<void> {
    if (!sub.scheduleId) return;
    await target.stripe.releaseSchedule(sub.scheduleId);
    await repo.updateSubscription(who.businessId, { scheduledPlan: null, scheduledAt: null, lastEventAt: eventMarker(target.record) });
    await auditAttempt(target, who, 'schedule_cancelled', { cancelled_plan: target.record.scheduledPlan });
  }

  async function upgrade(target: Target, who: Caller, prorationDate: number | undefined): Promise<ChangePlanResultDTO> {
    const now = nowSeconds();
    const pinned = prorationDate ?? now;
    if (now - pinned > PRORATION_DATE_MAX_AGE_SECONDS || pinned > now + 60) {
      throw ruleViolation('PRORATION_DATE_STALE', 'The quoted price is out of date: request a new preview');
    }
    const sub = await target.stripe.retrieveSubscription(target.record.stripeSubscriptionId);
    // A pending downgrade would flip the subscription back at renewal: choosing a higher plan drops it first.
    await releaseScheduleOf(target, sub, who);
    const result = await target.stripe.upgradeSubscriptionPlan({
      subscriptionId: sub.id,
      items: targetItems(target, sub),
      prorationDate: pinned,
      idempotencyKey: `plan:${who.businessId}:${who.key}`,
    });
    if (result.payment === 'paid') {
      await deps.applyOwnerChange(result.subscription, { businessId: who.businessId, actorId: who.actorId, ref: who.key, at: now });
      return { status: 'active', plan: target.plan };
    }
    if (result.payment === 'requires_action') {
      if (!result.hostedInvoiceUrl) throw new AppError('UPSTREAM_BILLING_ERROR', 'The payment provider returned no invoice page');
      await auditAttempt(target, who, 'requires_action', { invoice: result.invoiceId });
      return { status: 'requires_action', plan: target.plan, hosted_invoice_url: result.hostedInvoiceUrl };
    }
    // Declined: void the open invoice so Stripe neither retries it nor applies the change later.
    if (result.invoiceId) {
      await target.stripe.voidInvoice(result.invoiceId).catch((error: unknown) => deps.logger.error('billing_void_invoice_failed', { invoice_id: result.invoiceId, error }));
    }
    await auditAttempt(target, who, 'payment_failed', { invoice: result.invoiceId });
    throw new AppError('PAYMENT_FAILED', 'The card was declined, so the plan was not changed', { plan: target.plan });
  }

  async function downgrade(target: Target, who: Caller): Promise<ChangePlanResultDTO> {
    const { record, plan } = target;
    // Asking again for the downgrade that is already scheduled (a retry, a double tap) changes nothing.
    if (record.scheduledPlan === plan && record.scheduledAt) return { status: 'scheduled', plan, effective_at: record.scheduledAt };
    const sub = await target.stripe.retrieveSubscription(record.stripeSubscriptionId);
    if (!sub.currentPeriodEnd) throw new AppError('UPSTREAM_BILLING_ERROR', 'The subscription has no period end');
    await releaseScheduleOf(target, sub, who);
    const items = [{ price: priceIdFor(target.config, plan, 'ZAR') as string, quantity: 1 }, { price: usagePriceFor(target.config, plan, 'ZAR') as string }];
    await target.stripe.scheduleDowngrade({ subscriptionId: sub.id, items, idempotencyKey: `plan:${who.businessId}:${who.key}` });
    await repo.updateSubscription(who.businessId, { scheduledPlan: plan, scheduledAt: sub.currentPeriodEnd, lastEventAt: eventMarker(record) });
    await auditAttempt(target, who, 'downgrade_scheduled', { scheduled_at: sub.currentPeriodEnd });
    return { status: 'scheduled', plan, effective_at: sub.currentPeriodEnd };
  }

  /** "Keep my plan": choosing the current plan while a downgrade is scheduled drops the downgrade */
  async function keepCurrent(target: Target, who: Caller): Promise<ChangePlanResultDTO> {
    if (!target.record.scheduledPlan) throw ruleViolation('SAME_PLAN', 'The subscription is already on this plan');
    const sub = await target.stripe.retrieveSubscription(target.record.stripeSubscriptionId);
    if (sub.scheduleId) await releaseScheduleOf(target, sub, who);
    else await repo.updateSubscription(who.businessId, { scheduledPlan: null, scheduledAt: null, lastEventAt: eventMarker(target.record) });
    return { status: 'active', plan: target.plan };
  }

  async function changePlan(input: { businessId: UUID; actorId: string; plan: PaidPlan; idempotencyKey: string; prorationDate?: number }): Promise<ChangePlanResultDTO> {
    const target = await resolve(input.businessId, input.plan);
    const who: Caller = { businessId: input.businessId, actorId: input.actorId, key: input.idempotencyKey };
    switch (changeDirection(target.current, input.plan)) {
      case 'upgrade':
        return upgrade(target, who, input.prorationDate);
      case 'downgrade':
        return downgrade(target, who);
      case 'same':
        return keepCurrent(target, who);
    }
  }

  return { changePlan, previewPlanChange };
}
