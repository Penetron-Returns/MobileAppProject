-- =============================================================================
-- Plan flags (entitlements)
-- Single source of truth for "what may this business use". Code asks for a
-- feature key, never for a plan name. Plans change only through the service
-- role (a future billing webhook); the app has SELECT only.
--
--   plan_key       enum of internal plan ids (display names/prices live elsewhere)
--   businesses.plan  the plan a business is on (default 'free')
--   plan_features    (plan, feature) -> optional monthly limit (null = unlimited)
--   business_features(uuid)  plan + feature rows for one business
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'plan_key'
  ) then
    create type public.plan_key as enum ('free', 'starter', 'growth', 'pro');
  end if;
end
$$;

alter table public.businesses
  add column if not exists plan public.plan_key not null default 'free';

create table if not exists public.plan_features (
  plan          public.plan_key not null,
  feature       text not null check (feature ~ '^[a-z][a-z0-9_]*$'),
  -- null = no monthly cap. Caps for paid tiers are undecided and stay null.
  monthly_limit integer check (monthly_limit is null or monthly_limit >= 0),
  primary key (plan, feature)
);

-- Free: our deterministic WhatsApp menu + the owner inbox, no AI.
-- Paid: Nerova companion + desktop app. Nerova owns their WhatsApp, so no
-- whatsapp_menu and no inbox. Extensions are on every plan.
insert into public.plan_features (plan, feature, monthly_limit) values
  ('free',    'whatsapp_menu',      null),
  ('free',    'inbox',              null),
  ('free',    'extensions',         null),
  ('starter', 'companion',          null),
  ('starter', 'desktop_app',        null),
  ('starter', 'extensions',         null),
  ('starter', 'assistant_bookings', null),
  ('growth',  'companion',          null),
  ('growth',  'desktop_app',        null),
  ('growth',  'extensions',         null),
  ('growth',  'assistant_bookings', null),
  ('pro',     'companion',          null),
  ('pro',     'desktop_app',        null),
  ('pro',     'extensions',         null),
  ('pro',     'assistant_bookings', null)
on conflict (plan, feature) do nothing;

-- Catalogue data, readable by any signed-in user; nobody but the service role writes.
alter table public.plan_features enable row level security;
revoke all on public.plan_features from anon, authenticated;
grant select on public.plan_features to authenticated;
grant all on public.plan_features to service_role;

drop policy if exists plan_features_select on public.plan_features;
create policy plan_features_select on public.plan_features for select to authenticated using (true);

-- SECURITY INVOKER on purpose: for `authenticated` RLS on businesses limits the
-- result to the caller's own business; service_role bypasses RLS. Passing null
-- means "the caller's business" (JWT org).
create or replace function public.business_features(p_business_id uuid default null)
returns table (plan public.plan_key, feature text, monthly_limit integer)
language sql
stable
set search_path = ''
as $$
  select b.plan, pf.feature, pf.monthly_limit
    from public.businesses b
    join public.plan_features pf on pf.plan = b.plan
   where b.id = coalesce(p_business_id, private.current_business_id())
   order by pf.feature;
$$;

revoke all on function public.business_features(uuid) from public, anon, authenticated;
grant execute on function public.business_features(uuid) to authenticated, service_role;
