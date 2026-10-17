-- =============================================================================
-- Product updates (docs/stories.md): the structured, owner-friendly changelog behind the
-- "Product updates" story. Entries are product content (not demo data), so the first two are
-- seeded here. Only `approved` entries reach the app; a draft needs Colin's approval first.
--   * product_updates       global catalogue (not per business)
--   * product_update_views  one row per user per update
-- Writes come only from the service role. `authenticated` may read the approved catalogue
-- and its own views.
-- =============================================================================

create table if not exists public.product_updates (
  id          text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  released_at timestamptz not null,
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  body        text not null check (char_length(btrim(body)) between 1 and 400),
  tone        text not null default 'neutral' check (tone in ('positive', 'neutral', 'attention', 'concern')),
  -- {plans:[], roles:[], requires:[], platforms:[], minAppVersion}: an empty list means "any"
  tags        jsonb not null default '{}'::jsonb check (jsonb_typeof(tags) = 'object'),
  -- client-side demo id (e.g. 'undo', 'names'); the app owns the demo animations
  demo        text check (demo is null or demo ~ '^[a-z][a-z0-9_]{0,31}$'),
  status      text not null default 'draft' check (status in ('draft', 'approved')),
  -- optional {label, deeplink}
  action      jsonb check (action is null or jsonb_typeof(action) = 'object'),
  created_at  timestamptz not null default now()
);
create index if not exists product_updates_released_idx
  on public.product_updates (released_at desc) where status = 'approved';

create table if not exists public.product_update_views (
  update_id text not null references public.product_updates (id) on delete cascade,
  user_id   text not null references public.users (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (update_id, user_id)
);

alter table public.product_updates      enable row level security;
alter table public.product_update_views enable row level security;

revoke all on public.product_updates, public.product_update_views from anon, authenticated;
grant select on public.product_updates, public.product_update_views to authenticated;
grant all on public.product_updates, public.product_update_views to service_role;

drop policy if exists approved_select on public.product_updates;
create policy approved_select on public.product_updates
  for select to authenticated
  using (status = 'approved');

drop policy if exists own_select on public.product_update_views;
create policy own_select on public.product_update_views
  for select to authenticated
  using (user_id = (select auth.jwt() ->> 'sub'));

-- Seed (product content). Idempotent: re-applying never overwrites an edited entry.
insert into public.product_updates (id, released_at, title, body, tone, tags, demo, status, action) values
  ('say-undo', '2026-10-27 00:00:00+00',
   'Say ''undo''',
   'Clovie can now take back a booking she just made. Just say ''undo'' within 30 seconds.',
   'positive',
   '{"plans":["starter","growth","pro"],"roles":["owner"],"requires":["companion","act_then_undo"],"platforms":[]}'::jsonb,
   'undo', 'approved',
   '{"label":"Try it","deeplink":"clovie://voice"}'::jsonb),
  ('clients-by-name', '2026-10-27 00:00:00+00',
   'Clovie knows your clients by name',
   'Say ''Book Thandi for a silk press'' — if there are two Thandis, she''ll ask which one.',
   'neutral',
   '{"plans":[],"roles":[],"requires":["companion"],"platforms":[]}'::jsonb,
   'names', 'approved', null)
on conflict (id) do nothing;
