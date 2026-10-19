-- =============================================================================
-- Support requests: an owner asked Clovie's companion for a human (Nerova's
-- request_human_support tool raises `escalation.raised` with source owner_support).
--
--   * summary: the owner's own words as Nerova summarised them. Personal data:
--     stored here, never logged.
--   * health: the WhatsApp health snapshot Nerova attached (no message content).
--   * status: open until Nerova raises `escalation.resolved` for the same account.
--
-- Written by the API (service role) only. Owners of the business can read their
-- own requests; there are no write policies for authenticated.
-- =============================================================================
create table if not exists public.support_requests (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses (id) on delete cascade,
  nerova_account_id text not null check (length(nerova_account_id) between 1 and 200),
  summary           text not null check (length(summary) <= 4000),
  health            jsonb not null default '{}'::jsonb,
  status            text not null default 'open' check (status in ('open', 'resolved')),
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz,
  check ((status = 'resolved') = (resolved_at is not null))
);
create index if not exists support_requests_business_created_idx
  on public.support_requests (business_id, created_at desc);
create index if not exists support_requests_open_idx
  on public.support_requests (nerova_account_id) where status = 'open';

alter table public.support_requests enable row level security;

revoke all on public.support_requests from anon, authenticated;
grant select on public.support_requests to authenticated;
grant all on public.support_requests to service_role;

drop policy if exists owners_select on public.support_requests;
create policy owners_select on public.support_requests
  for select to authenticated
  using (
    business_id = (select private.current_business_id())
    and exists (
      select 1 from public.users u
       where u.id = (select auth.jwt() ->> 'sub') and u.business_id = support_requests.business_id and u.role = 'owner'
    )
  );
