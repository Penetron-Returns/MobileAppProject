-- =============================================================================
-- Scheduled downgrade. A downgrade is not applied at once: it is scheduled at Stripe for the end of the paid
-- period (Subscription Schedule) and the higher plan stays until Stripe renews on the lower prices.
--   * scheduled_plan: the paid tier the subscription moves to at scheduled_at (null = nothing scheduled)
--   * scheduled_at:   the period end the change was scheduled for
-- Written by the plan-change route, cleared by the Stripe webhook once the change happened (or the schedule was
-- released). Same access as the rest of the row: service role only.
-- =============================================================================

alter table public.billing_subscriptions
  add column if not exists scheduled_plan public.plan_key
    check (scheduled_plan is null or scheduled_plan in ('starter', 'growth', 'pro')),
  add column if not exists scheduled_at timestamptz,
  add constraint billing_subscriptions_schedule_pair check ((scheduled_plan is null) = (scheduled_at is null));
