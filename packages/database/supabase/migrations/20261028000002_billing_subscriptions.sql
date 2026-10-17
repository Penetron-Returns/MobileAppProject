-- =============================================================================
-- Stripe billing
--   * new businesses start on plan 'none' (entitled to nothing) instead of 'free'
--   * business_features() returns one row (feature null) for a plan with no
--     features, so a 'none' business still resolves to its plan
--   * billing_subscriptions: one row per business with its Stripe customer and
--     subscription state. Service role only (written by the checkout route and
--     the Stripe webhook); no grant to authenticated, the API shapes what the app sees.
--   * webhook_events accepts source 'stripe'
-- businesses.plan stays writable by the service role only (unchanged).
-- =============================================================================

alter table public.businesses alter column plan set default 'none';

-- Left join: a plan without plan_features rows ('none') still yields its plan.
create or replace function public.business_features(p_business_id uuid default null)
returns table (plan public.plan_key, feature text, monthly_limit integer)
language sql
stable
set search_path = ''
as $$
  select b.plan, pf.feature, pf.monthly_limit
    from public.businesses b
    left join public.plan_features pf on pf.plan = b.plan
   where b.id = coalesce(p_business_id, private.current_business_id())
   order by pf.feature;
$$;

revoke all on function public.business_features(uuid) from public, anon, authenticated;
grant execute on function public.business_features(uuid) to authenticated, service_role;

create table if not exists public.billing_subscriptions (
  business_id            uuid primary key references public.businesses(id) on delete cascade,
  stripe_customer_id     text not null unique check (stripe_customer_id like 'cus\_%'),
  stripe_subscription_id text unique check (stripe_subscription_id is null or stripe_subscription_id like 'sub\_%'),
  -- Stripe subscription status; null until the first subscription exists
  status                 text check (status is null or status in
                           ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')),
  -- the tier the subscription's price maps to (never 'none' or 'free')
  plan                   public.plan_key check (plan is null or plan in ('starter', 'growth', 'pro')),
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  -- created time of the newest Stripe event applied: older, out-of-order events are ignored
  last_event_at          timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.billing_subscriptions enable row level security;
revoke all on public.billing_subscriptions from anon, authenticated;
grant all on public.billing_subscriptions to service_role;

alter table public.webhook_events drop constraint if exists webhook_events_source_check;
alter table public.webhook_events
  add constraint webhook_events_source_check check (source in ('whatsapp', 'clerk', 'nerova', 'stripe'));

drop trigger if exists set_updated_at on public.billing_subscriptions;
create trigger set_updated_at before update on public.billing_subscriptions
  for each row execute function private.set_updated_at();
