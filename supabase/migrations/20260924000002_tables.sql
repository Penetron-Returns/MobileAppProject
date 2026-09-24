-- =============================================================================
-- 0002 · Tables, constraints and indexes
-- BUILD_PLAN §3 "Tables". Every business-owned table carries business_id with
-- ON DELETE CASCADE from businesses. Cross-business integrity is enforced with
-- composite foreign keys (business_id, <fk>) → (business_id, id), so a row can
-- never point at a staff member / service / client of another business.
--
-- FK naming: composite FKs are named <table>_<column>_fkey (the name Postgres
-- would give a single-column FK) so PostgREST embed hints read naturally, e.g.
-- appointments?select=*,clients!appointments_client_id_fkey(*).
--
-- "Restrict" semantics use NO ACTION (checked at end of statement) rather than
-- RESTRICT (checked immediately) so that deleting a business still cascades
-- cleanly through clients → appointments within one statement.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- businesses
-- -----------------------------------------------------------------------------
create table if not exists public.businesses (
  id            uuid primary key default gen_random_uuid(),
  clerk_org_id  text not null unique,
  name          text not null check (length(btrim(name)) > 0),
  slug          extensions.citext not null unique
                  check (slug::text ~* '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'),
  timezone      text not null default 'Africa/Johannesburg',
  currency      char(3) not null default 'ZAR' check (currency ~ '^[A-Z]{3}$'),
  logo_url      text,
  address       text,
  phone         text,
  email         text,
  booking_rules jsonb not null default '{
    "lead_time_minutes": 60,
    "cancellation_window_minutes": 1440,
    "buffer_minutes": 0,
    "slot_interval_minutes": 15,
    "booking_horizon_days": 60,
    "reminder_offsets_minutes": [1440, 120],
    "allow_staff_selection": true
  }'::jsonb check (jsonb_typeof(booking_rules) = 'object'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- users (mirrored from Clerk; id = Clerk user id)
-- -----------------------------------------------------------------------------
create table if not exists public.users (
  id           text primary key,
  business_id  uuid references public.businesses (id) on delete set null,
  role         public.member_role not null default 'staff',
  email        text,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists users_business_id_idx on public.users (business_id);

-- -----------------------------------------------------------------------------
-- staff
-- -----------------------------------------------------------------------------
create table if not exists public.staff (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  user_id          text references public.users (id) on delete set null,
  name             text not null check (length(btrim(name)) > 0),
  title            text,
  photo_url        text,
  phone            text,
  email            text,
  color            text,
  is_active        boolean not null default true,
  accepts_bookings boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint staff_business_id_id_key unique (business_id, id)
);
create index if not exists staff_business_sort_idx on public.staff (business_id, sort_order, id);
create index if not exists staff_user_id_idx on public.staff (user_id);

-- -----------------------------------------------------------------------------
-- services
-- -----------------------------------------------------------------------------
create table if not exists public.services (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  name             text not null check (length(btrim(name)) > 0),
  description      text,
  category         text,
  duration_minutes integer not null check (duration_minutes > 0 and duration_minutes <= 720),
  price_cents      integer not null default 0 check (price_cents >= 0),
  deposit_cents    integer not null default 0 check (deposit_cents >= 0),
  is_active        boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint services_business_id_id_key unique (business_id, id)
);
create index if not exists services_business_sort_idx on public.services (business_id, sort_order, id);

-- -----------------------------------------------------------------------------
-- staff_services (who can perform what)
-- -----------------------------------------------------------------------------
create table if not exists public.staff_services (
  staff_id    uuid not null,
  service_id  uuid not null,
  business_id uuid not null references public.businesses (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (staff_id, service_id),
  constraint staff_services_staff_id_fkey foreign key (business_id, staff_id)
    references public.staff (business_id, id) on delete cascade,
  constraint staff_services_service_id_fkey foreign key (business_id, service_id)
    references public.services (business_id, id) on delete cascade
);
create index if not exists staff_services_service_idx on public.staff_services (business_id, service_id);
create index if not exists staff_services_staff_idx on public.staff_services (business_id, staff_id);

-- -----------------------------------------------------------------------------
-- business_hours (several rows per weekday = split shifts; no rows = closed)
-- -----------------------------------------------------------------------------
create table if not exists public.business_hours (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6),
  opens_at    time not null,
  closes_at   time not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint business_hours_window_check check (closes_at > opens_at)
);
create index if not exists business_hours_business_weekday_idx
  on public.business_hours (business_id, weekday, opens_at);

-- -----------------------------------------------------------------------------
-- availability_rules (staff working hours; zero rules ⇒ inherits business_hours)
-- -----------------------------------------------------------------------------
create table if not exists public.availability_rules (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  staff_id    uuid not null,
  weekday     smallint not null check (weekday between 0 and 6),
  start_time  time not null,
  end_time    time not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint availability_rules_window_check check (end_time > start_time),
  constraint availability_rules_staff_id_fkey foreign key (business_id, staff_id)
    references public.staff (business_id, id) on delete cascade
);
create index if not exists availability_rules_staff_weekday_idx
  on public.availability_rules (business_id, staff_id, weekday, start_time);

-- -----------------------------------------------------------------------------
-- availability_overrides (staff_id null = whole business)
-- -----------------------------------------------------------------------------
create table if not exists public.availability_overrides (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  staff_id    uuid,
  date        date not null,
  start_time  time,
  end_time    time,
  is_closed   boolean not null default false,
  reason      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- an open (not closed) override must carry a valid replacement window
  constraint availability_overrides_window_check check (
    is_closed or (start_time is not null and end_time is not null and end_time > start_time)
  ),
  constraint availability_overrides_staff_id_fkey foreign key (business_id, staff_id)
    references public.staff (business_id, id) on delete cascade
);
create index if not exists availability_overrides_business_date_idx
  on public.availability_overrides (business_id, date);
create index if not exists availability_overrides_staff_date_idx
  on public.availability_overrides (staff_id, date) where staff_id is not null;

-- -----------------------------------------------------------------------------
-- clients
-- -----------------------------------------------------------------------------
create table if not exists public.clients (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  phone_e164      text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  name            text,
  email           text,
  notes           text,
  tags            text[] not null default '{}',
  is_blocked      boolean not null default false,
  whatsapp_opt_in boolean not null default true,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint clients_business_id_phone_e164_key unique (business_id, phone_e164),
  constraint clients_business_id_id_key unique (business_id, id)
);
create index if not exists clients_business_name_idx on public.clients (business_id, lower(name));
create index if not exists clients_business_last_seen_idx
  on public.clients (business_id, last_seen_at desc nulls last);
create index if not exists clients_tags_idx on public.clients using gin (tags);

-- -----------------------------------------------------------------------------
-- client_notes
-- -----------------------------------------------------------------------------
create table if not exists public.client_notes (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  client_id   uuid not null,
  body        text not null check (length(btrim(body)) > 0),
  kind        text not null default 'general' check (kind in ('general', 'warning', 'preference')),
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint client_notes_client_id_fkey foreign key (business_id, client_id)
    references public.clients (business_id, id) on delete cascade
);
create index if not exists client_notes_client_idx on public.client_notes (client_id, created_at desc);

-- -----------------------------------------------------------------------------
-- appointments
-- -----------------------------------------------------------------------------
create table if not exists public.appointments (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  client_id        uuid not null,
  staff_id         uuid not null,
  service_id       uuid not null,
  slot             tstzrange not null,
  blocked          tstzrange not null,
  -- Convenience mirrors of the range bounds so PostgREST clients can filter
  -- and order (`.gte('starts_at', …)`) without parsing range literals.
  starts_at        timestamptz generated always as (lower(slot)) stored not null,
  ends_at          timestamptz generated always as (upper(slot)) stored not null,
  status           public.appointment_status not null default 'confirmed',
  source           public.appointment_source not null,
  price_cents      integer not null check (price_cents >= 0),
  duration_minutes integer not null check (duration_minutes > 0 and duration_minutes <= 720),
  notes            text,
  idempotency_key  text unique,
  checked_in_at    timestamptz,
  cancelled_at     timestamptz,
  cancel_reason    text,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint appointments_business_id_id_key unique (business_id, id),
  constraint appointments_slot_check check (
    not isempty(slot) and not lower_inf(slot) and not upper_inf(slot)
    and lower_inc(slot) and not upper_inc(slot)
    and lower(slot) < upper(slot)
    and upper(slot) - lower(slot) = make_interval(mins => duration_minutes)
  ),
  constraint appointments_blocked_check check (
    not isempty(blocked) and not lower_inf(blocked) and not upper_inf(blocked)
    and lower_inc(blocked) and not upper_inc(blocked)
    and blocked @> slot
    and lower(blocked) = lower(slot)
  ),
  constraint appointments_cancelled_check check (
    (status = 'cancelled') = (cancelled_at is not null)
  ),
  constraint appointments_client_id_fkey foreign key (business_id, client_id)
    references public.clients (business_id, id) on delete no action,
  constraint appointments_staff_id_fkey foreign key (business_id, staff_id)
    references public.staff (business_id, id) on delete no action,
  constraint appointments_service_id_fkey foreign key (business_id, service_id)
    references public.services (business_id, id) on delete no action,
  -- BUILD_PLAN rule 3: double booking is impossible at the data layer.
  constraint appointments_no_overlap exclude using gist (
    staff_id with =,
    blocked  with &&
  ) where (status <> 'cancelled')
);
create index if not exists appointments_business_start_idx
  on public.appointments (business_id, lower(slot));
create index if not exists appointments_business_starts_at_idx
  on public.appointments (business_id, starts_at);
create index if not exists appointments_client_start_idx
  on public.appointments (client_id, starts_at desc);
create index if not exists appointments_staff_start_idx
  on public.appointments (staff_id, starts_at);
create index if not exists appointments_service_idx
  on public.appointments (business_id, service_id);
create index if not exists appointments_confirmed_start_idx
  on public.appointments (starts_at) where status = 'confirmed';

-- -----------------------------------------------------------------------------
-- appointment_events
-- -----------------------------------------------------------------------------
create table if not exists public.appointment_events (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  appointment_id uuid not null,
  type           public.appointment_event_type not null,
  actor          public.actor_type not null,
  actor_id       text,
  payload        jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  occurred_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  constraint appointment_events_appointment_id_fkey foreign key (business_id, appointment_id)
    references public.appointments (business_id, id) on delete cascade
);
create index if not exists appointment_events_appointment_idx
  on public.appointment_events (appointment_id, occurred_at);
create index if not exists appointment_events_business_idx
  on public.appointment_events (business_id, occurred_at desc);
-- One reminder per (appointment, offset, start time). starts_at is part of the
-- key so a rescheduled appointment is reminded again for its new time
-- (see docs/database.md → Deviations).
create unique index if not exists appointment_events_reminder_once_idx
  on public.appointment_events (appointment_id, (payload ->> 'offset_minutes'), (payload ->> 'starts_at'))
  where type = 'reminder_sent';

-- -----------------------------------------------------------------------------
-- audit_log (no FK on business_id: history survives business deletion)
-- -----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  business_id uuid,
  actor       public.actor_type not null default 'system',
  actor_id    text,
  action      text not null check (action in ('insert', 'update', 'delete')),
  entity      text not null,
  entity_id   text,
  diff        jsonb,
  request_id  text,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_business_idx on public.audit_log (business_id, occurred_at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id);

-- -----------------------------------------------------------------------------
-- whatsapp_accounts (one per business)
-- -----------------------------------------------------------------------------
create table if not exists public.whatsapp_accounts (
  id                       uuid primary key default gen_random_uuid(),
  business_id              uuid not null unique references public.businesses (id) on delete cascade,
  waba_id                  text not null,
  phone_number_id          text not null unique,
  display_phone            text,
  verified_name            text,
  access_token_ciphertext  text,
  token_expires_at         timestamptz,
  flow_ids                 jsonb not null default '{}' check (jsonb_typeof(flow_ids) = 'object'),
  status                   public.wa_account_status not null default 'pending',
  quality_rating           text,
  messaging_limit          text,
  last_health_check_at     timestamptz,
  last_error               text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint whatsapp_accounts_business_id_id_key unique (business_id, id)
);

-- -----------------------------------------------------------------------------
-- message_templates
-- -----------------------------------------------------------------------------
create table if not exists public.message_templates (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses (id) on delete cascade,
  whatsapp_account_id uuid not null,
  name                text not null,
  category            text,
  language            text not null default 'en',
  meta_template_id    text,
  status              public.template_status not null default 'draft',
  rejection_reason    text,
  components          jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint message_templates_account_name_language_key unique (whatsapp_account_id, name, language),
  constraint message_templates_whatsapp_account_id_fkey foreign key (business_id, whatsapp_account_id)
    references public.whatsapp_accounts (business_id, id) on delete cascade
);
create index if not exists message_templates_business_idx on public.message_templates (business_id);

-- -----------------------------------------------------------------------------
-- conversations (one thread per client)
-- -----------------------------------------------------------------------------
create table if not exists public.conversations (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses (id) on delete cascade,
  client_id           uuid not null,
  state               text not null default 'idle',
  context             jsonb not null default '{}' check (jsonb_typeof(context) = 'object'),
  version             integer not null default 0,
  invalid_input_count integer not null default 0 check (invalid_input_count >= 0),
  window_expires_at   timestamptz,
  last_inbound_at     timestamptz,
  last_message_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- BUILD_PLAN §5: exactly these states.
  constraint conversations_state_check check (state in (
    'idle', 'menu', 'flow_booking', 'flow_reschedule', 'select_service', 'select_staff',
    'select_date', 'select_slot', 'confirm', 'manage_booking', 'manage_appointment',
    'reschedule_select_date', 'reschedule_select_slot', 'reschedule_confirm',
    'cancel_confirm', 'escalated', 'closed'
  )),
  constraint conversations_business_id_client_id_key unique (business_id, client_id),
  constraint conversations_business_id_id_key unique (business_id, id),
  constraint conversations_client_id_fkey foreign key (business_id, client_id)
    references public.clients (business_id, id) on delete cascade
);
create index if not exists conversations_business_last_message_idx
  on public.conversations (business_id, last_message_at desc nulls last);
create index if not exists conversations_window_idx
  on public.conversations (window_expires_at) where state not in ('idle', 'closed');

-- -----------------------------------------------------------------------------
-- messages
-- -----------------------------------------------------------------------------
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  conversation_id uuid not null,
  direction       public.message_direction not null,
  wa_message_id   text unique,
  type            public.message_type not null,
  body            jsonb not null,
  status          public.message_status not null,
  error           jsonb,
  sent_by         text,
  sent_at         timestamptz,
  delivered_at    timestamptz,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint messages_conversation_id_fkey foreign key (business_id, conversation_id)
    references public.conversations (business_id, id) on delete cascade
);
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);
create index if not exists messages_business_created_idx
  on public.messages (business_id, created_at desc);

-- -----------------------------------------------------------------------------
-- webhook_events (service role only; dedupe + replay)
-- -----------------------------------------------------------------------------
create table if not exists public.webhook_events (
  id                  uuid primary key default gen_random_uuid(),
  source              text not null check (source in ('whatsapp', 'clerk')),
  event_key           text not null,
  whatsapp_account_id uuid references public.whatsapp_accounts (id) on delete set null,
  payload             jsonb not null,
  received_at         timestamptz not null default now(),
  processed_at        timestamptz,
  error               text,
  attempts            integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint webhook_events_source_event_key_key unique (source, event_key)
);
create index if not exists webhook_events_unprocessed_idx
  on public.webhook_events (received_at) where processed_at is null;
create index if not exists webhook_events_processed_idx
  on public.webhook_events (processed_at) where processed_at is not null;
create index if not exists webhook_events_account_idx on public.webhook_events (whatsapp_account_id);

-- -----------------------------------------------------------------------------
-- escalations (one open per conversation)
-- -----------------------------------------------------------------------------
create table if not exists public.escalations (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  conversation_id  uuid not null,
  client_id        uuid not null,
  reason           text not null check (reason in (
                     'customer_requested', 'unrecognised_input', 'unlinked_number',
                     'delivery_failed', 'flow_error', 'cancellation_window')),
  status           public.escalation_status not null default 'open',
  assigned_user_id text,
  note             text,
  resolved_at      timestamptz,
  resolved_by      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint escalations_conversation_id_fkey foreign key (business_id, conversation_id)
    references public.conversations (business_id, id) on delete cascade,
  constraint escalations_client_id_fkey foreign key (business_id, client_id)
    references public.clients (business_id, id) on delete cascade
);
create unique index if not exists escalations_one_open_per_conversation_idx
  on public.escalations (conversation_id) where status = 'open';
create index if not exists escalations_business_status_idx
  on public.escalations (business_id, status, created_at desc);
create index if not exists escalations_client_idx on public.escalations (client_id);

-- -----------------------------------------------------------------------------
-- idempotency_keys (service role only)
-- -----------------------------------------------------------------------------
create table if not exists public.idempotency_keys (
  key          text primary key,
  business_id  uuid references public.businesses (id) on delete cascade,
  endpoint     text not null,
  request_hash text not null,
  status_code  integer,
  response     jsonb,
  expires_at   timestamptz not null default (now() + interval '7 days'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idempotency_keys_expires_idx on public.idempotency_keys (expires_at);
create index if not exists idempotency_keys_business_idx on public.idempotency_keys (business_id);

-- -----------------------------------------------------------------------------
-- booking_attempts (FR21 research instrumentation)
-- -----------------------------------------------------------------------------
create table if not exists public.booking_attempts (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  channel         public.booking_channel not null,
  client_id       uuid,
  conversation_id uuid,
  session_key     text,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  step_count      integer not null default 0 check (step_count >= 0),
  outcome         public.attempt_outcome not null default 'in_progress',
  appointment_id  uuid,
  error_code      text,
  steps           jsonb not null default '[]' check (jsonb_typeof(steps) = 'array'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint booking_attempts_client_id_fkey foreign key (business_id, client_id)
    references public.clients (business_id, id) on delete set null (client_id),
  constraint booking_attempts_conversation_id_fkey foreign key (business_id, conversation_id)
    references public.conversations (business_id, id) on delete set null (conversation_id),
  constraint booking_attempts_appointment_id_fkey foreign key (business_id, appointment_id)
    references public.appointments (business_id, id) on delete set null (appointment_id)
);
create index if not exists booking_attempts_business_started_idx
  on public.booking_attempts (business_id, started_at desc);
create index if not exists booking_attempts_session_key_idx
  on public.booking_attempts (session_key) where session_key is not null;
create index if not exists booking_attempts_in_progress_idx
  on public.booking_attempts (started_at) where outcome = 'in_progress';
create index if not exists booking_attempts_conversation_idx
  on public.booking_attempts (conversation_id) where conversation_id is not null;
create index if not exists booking_attempts_client_idx
  on public.booking_attempts (client_id) where client_id is not null;
create index if not exists booking_attempts_appointment_idx
  on public.booking_attempts (appointment_id) where appointment_id is not null;

-- -----------------------------------------------------------------------------
-- device_push_tokens (Expo push)
-- -----------------------------------------------------------------------------
create table if not exists public.device_push_tokens (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id     text not null references public.users (id) on delete cascade,
  token       text not null unique,
  platform    text check (platform in ('ios', 'android', 'web')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists device_push_tokens_user_idx on public.device_push_tokens (user_id);
create index if not exists device_push_tokens_business_idx on public.device_push_tokens (business_id);
