-- =============================================================================
-- Clovie stories (docs/stories.md): generated Brief / Client updates / Business update, per-person
-- viewed state and anonymous analytics events.
--   * stories        one row per (business, kind, period); cards are a jsonb array of fixed-template cards
--   * story_views    one row per user per story (furthest card reached)
--   * story_events   append-only analytics; no PII (ids, kind, card index, event name only)
-- Writes come only from the service role (cron job + API). `authenticated` gets SELECT only:
-- stories and events are business-scoped, views are limited to the caller's own rows.
-- =============================================================================

create table if not exists public.stories (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  kind         text not null check (kind in ('brief', 'clients', 'business')),
  -- '2026-10-17' (brief), '2026-W42' (weekly) or '2026-10' (month-end business update)
  period_key   text not null check (char_length(period_key) between 7 and 10),
  tone         text not null check (tone in ('positive', 'neutral', 'attention', 'concern')),
  cards        jsonb not null check (jsonb_typeof(cards) = 'array'),
  generated_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  constraint stories_business_kind_period_key unique (business_id, kind, period_key),
  constraint stories_expiry_check check (expires_at > generated_at)
);
create index if not exists stories_business_kind_generated_idx
  on public.stories (business_id, kind, generated_at desc);

create table if not exists public.story_views (
  story_id        uuid not null references public.stories (id) on delete cascade,
  user_id         text not null references public.users (id) on delete cascade,
  viewed_at       timestamptz not null default now(),
  last_card_index integer not null default 0 check (last_card_index >= 0),
  primary key (story_id, user_id)
);

create table if not exists public.story_events (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id     text not null references public.users (id) on delete cascade,
  story_kind  text not null check (story_kind in ('brief', 'clients', 'business', 'product')),
  story_id    uuid references public.stories (id) on delete set null,
  card_index  integer not null default 0 check (card_index >= 0),
  event       text not null check (event in ('open', 'card_view', 'complete', 'skip', 'close', 'action')),
  at          timestamptz not null default now()
);
create index if not exists story_events_business_at_idx on public.story_events (business_id, at desc);

alter table public.stories      enable row level security;
alter table public.story_views  enable row level security;
alter table public.story_events enable row level security;

revoke all on public.stories, public.story_views, public.story_events from anon, authenticated;
grant select on public.stories, public.story_views, public.story_events to authenticated;
grant all on public.stories, public.story_views, public.story_events to service_role;

drop policy if exists members_select on public.stories;
create policy members_select on public.stories
  for select to authenticated
  using (business_id = (select private.current_business_id()));

drop policy if exists own_select on public.story_views;
create policy own_select on public.story_views
  for select to authenticated
  using (user_id = (select auth.jwt() ->> 'sub'));

drop policy if exists members_select on public.story_events;
create policy members_select on public.story_events
  for select to authenticated
  using (business_id = (select private.current_business_id()));
