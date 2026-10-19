# Build Plan: WhatsApp Booking Platform (free edition)

Source spec: *ITMDA3 Deliverable 3, Group S14*. This file pins the contracts that every workstream builds against. If code and this file disagree, fix one of them in the same PR. Don't let them drift.

**Free edition.** This branch is the free, open-source edition used for the ITMDA3 research project. It contains no AI, no voice, no payments and no plans. The only customer channel logic is the **deterministic WhatsApp menu flow** (structured menus, lists, Flows and fixed replies; no NLU and no free-text interpretation), with a web booking page as the comparator. The closed-source Nerova companion, Hey Clovie voice, stories and Stripe billing were removed from the code. The database migrations were NOT changed, so a few unused tables, columns, RPCs and cron entries remain (see *Free edition: leftovers* at the end).

## 1. Architecture (from the spec, §6)

| Tier | Tech | Role |
| --- | --- | --- |
| Client | Expo (React Native), Expo Router, NativeWind + react-native-reusables (shadcn for RN) | Owner/staff app. Reads through Supabase (RLS) and writes through the API |
| API | Supabase Edge Functions (Deno, TypeScript, Hono): one function `api`, code in `apps/api/` | All writes, booking rules, availability, WhatsApp engine. The only holder of Meta tokens |
| Data | Supabase Postgres + RLS + Realtime + Storage + pg_cron | Single source of truth |
| Identity | Clerk (orgs = businesses, roles owner/staff) | JWTs trusted by Supabase (third-party auth) and verified by the API |
| Channel | Meta WhatsApp Cloud API + WhatsApp Flows | Customer surface. Deterministic, with no AI and no free-text parsing |

Rules that are never broken:
1. **Deterministic.** Every inbound WhatsApp event maps to `(state, input id) → (next state, actions)`. Anything else is rejected with a fixed message. We never interpret free text.
2. **All writes go through the API.** The app gets `SELECT` only (RLS). The API uses the service-role key.
3. **Double booking is impossible at the data layer.** A `btree_gist` exclusion constraint on `(staff_id, blocked)` for non-cancelled appointments.
4. **Idempotent mutations.** Every mutating API call needs an `Idempotency-Key` header, stored in `idempotency_keys`, and a replay returns the stored response. Records are scoped to the caller: by `business_id`, or for `/v1/onboarding` (no business yet) by prefixing the stored key with `session:<org>:<user>:`.
5. **Availability is computed live** from rules, overrides and appointments. It is never cached.
6. **Audit everything.** `appointment_events` covers the appointment lifecycle and `audit_log` covers configuration changes.
7. **PII is redacted in logs.** Phone numbers are masked to their last 4 digits, and names and message bodies never go to logs.

## 2. Repository layout and ownership

```
apps/mobile/                 Expo app (own package.json)                                        -> WS-D
  src/app/**                 Expo Router routes (thin)
  src/features/**            feature modules (calendar, bookings, clients, settings, onboarding, inbox, reports, ...)
  src/components/**, src/lib/**   app composites, api client, supabase client, query client
apps/api/                    API shell: Hono app, routes, middleware, env, container (own package.json, Vitest)
  src/app.ts, container.ts, env.ts, types.ts   route mounting, composition root, env schema
  src/routes/v1/**           admin REST: booking core, catalog, schedule, team, attendance, reports -> WS-B
  src/routes/public.ts       web-booking comparator API                                         -> WS-B
  src/routes/clerk.ts        Clerk webhook                                                      -> WS-B
  src/routes/whatsapp/**     webhook, flows endpoint, /v1/whatsapp, inbox                       -> WS-C
  src/routes/cron.ts         CRON_JOBS registry                                                 -> WS-C
  src/middleware/**, src/lib/**   auth, idempotency, request context, validation, db client
packages/features/           booking domain (runtime-neutral): bookings (BookingService), availability,
                             catalog, clients, team, onboarding, attendance, reports, repositories,
                             lib, ports.ts                                                      -> WS-B
packages/app-store/whatsapp/ the deterministic WhatsApp app: Graph client, engine (state machine), Flows,
                             webhook processing, inbox, jobs, customer and push notifications  -> WS-C
packages/testing/            in-memory fakes that honour the real port contracts
packages/types/              TYPES ONLY (no runtime imports), used by app + API (@booking/types)
  api.ts                     DTOs + request/response contracts
packages/ui/                 design system `@booking/ui` (tokens, primitives, components, patterns)
packages/database/           Supabase project (@booking/database)                               -> WS-A
  database.types.ts          generated Supabase `Database` type
  supabase/                  config.toml, migrations, seed, SQL tests (CLI runs with --workdir packages/database)
    functions/api/           Edge Function entry (Deno) serving apps/api/src/app.ts under /api
packages/config/             shared tooling presets (@booking/config): prettier, API tsconfig, eslint base
docs/                        this plan + per-area docs
```

Time conventions: the API speaks ISO-8601 with an offset for instants (`2026-09-30T09:00:00.000Z`) and `YYYY-MM-DD` for calendar dates **in the business timezone**. Weekday is `0 = Sunday … 6 = Saturday` (same as JS `getDay()` and Postgres `extract(dow)`). Money is integer cents in `businesses.currency` (default `ZAR`). Default timezone is `Africa/Johannesburg`.

## 3. Database schema (WS-A implements, everyone codes against it)

Extensions: `pgcrypto`, `btree_gist`, `citext`, plus `pg_cron` and `pg_net` only in a separate migration guarded so local Postgres without them still migrates.

Schemas: tables live in `public`. Helpers (`current_business_id()`, audit trigger fn) live in `private`. Write RPCs live in `public`, with `EXECUTE` revoked from `anon` and `authenticated` and granted to `service_role` only, unless noted.

### Enums
- `member_role`: `owner | staff`
- `appointment_status`: `confirmed | cancelled | completed | no_show`
- `appointment_source`: `whatsapp | app | web | nerova` (`nerova` is a legacy value from the paid edition; nothing in this edition writes it)
- `appointment_event_type`: `created | rescheduled | cancelled | completed | no_show | checked_in | reminder_sent | confirmation_sent | notes_updated | client_confirmed` (`client_confirmed` is legacy and unused)
- `actor_type`: `customer | staff | system | nerova` (`nerova` is legacy and unused)
- `wa_account_status`: `pending | live | needs_reauth | disconnected | paused`
- `template_status`: `draft | submitted | approved | rejected | paused | disabled`
- `message_direction`: `in | out`
- `message_type`: `text | interactive | flow | template | button | reaction | media | unknown`
- `message_status`: `received | queued | sent | delivered | read | failed`
- `escalation_status`: `open | resolved`
- `booking_channel`: `whatsapp | web | app`
- `attempt_outcome`: `in_progress | completed | abandoned | failed`
- `plan_key`: a legacy enum (`none | free | starter | growth | pro`) that still exists in the database. This edition has no plans: nothing reads or writes it.

### Tables
All have `id uuid pk default gen_random_uuid()` (unless noted) and `created_at timestamptz not null default now()`. Mutable tables also have `updated_at` maintained by a trigger. Every business-owned table has `business_id uuid not null references businesses on delete cascade`.

| Table | Columns (beyond id/created_at/updated_at/business_id) | Notes |
| --- | --- | --- |
| `businesses` | `clerk_org_id text unique not null`, `attendance_mode text not null default 'staff' check in ('staff','owner')` (who answers the attendance check), `name text not null`, `slug citext unique not null`, `timezone text not null default 'Africa/Johannesburg'`, `currency char(3) not null default 'ZAR'`, `logo_url text`, `address text`, `phone text`, `email text`, `onboarded_at timestamptz null` (set last by `complete_onboarding`; null = setup not finished), `booking_rules jsonb not null default <below>` | no business_id. Two legacy columns, `plan` and `nerova_account_id`, remain but are unused (see *Free edition: leftovers*) |
| `users` | `id text pk` (Clerk user id), `business_id uuid null`, `role member_role not null default 'staff'`, `email text`, `display_name text`, `avatar_url text` | mirrored from Clerk |
| `staff` | `user_id text null references users`, `name text not null`, `title text`, `photo_url text`, `phone text`, `email text`, `color text`, `is_active bool not null default true`, `accepts_bookings bool not null default true`, `sort_order int not null default 0` | a staff member may have no login |
| `services` | `name text not null`, `description text`, `category text`, `duration_minutes int not null check (>0 and <= 720)`, `price_cents int not null default 0 check (>=0)`, `deposit_cents int not null default 0`, `is_active bool not null default true`, `sort_order int not null default 0` | |
| `staff_services` | pk(`staff_id`,`service_id`), `business_id` | who can perform what |
| `business_hours` | `weekday smallint 0..6`, `opens_at time`, `closes_at time` check closes>opens | **one range per weekday** (unique `(business_id, weekday)`): the outer bound. No row = closed. A lunch gap is a staff break, not a second range |
| `availability_rules` | `staff_id uuid not null`, `weekday smallint`, `start_time time`, `end_time time` check end>start | staff working hours, **one range per weekday** (unique `(staff_id, weekday)`), always clipped to business hours and special days. **A staff member with zero rules inherits business_hours** |
| `availability_overrides` | `staff_id uuid not null`, `date date not null`, `start_time time null`, `end_time time null`, `is_closed bool not null default false`, `reason text` | **per-staff** day override: if `is_closed` that staff member is off that date, otherwise the window **replaces** their weekday rules for that date (still clipped to business hours and special days, breaks and time off still apply). Business-wide overrides were converted into `business_special_days` and the column is now NOT NULL |
| `business_special_days` | `date date not null`, `name text not null` (1..120), `kind special_day_kind` (`public_holiday` \| `closure` \| `special_hours`), `is_closed bool not null default true`, `start_time time null`, `end_time time null` | business-wide closed date or **replacement hours (one range)**. unique(`business_id`,`date`). Check: closed ⇒ no times; open ⇒ `start < end` within 00:00-24:00; `closure` must be closed, `special_hours` must be open, `public_holiday` either. A closed row blocks bookings the moment it exists. Chosen over adding `name`/`kind` to `availability_overrides` because overrides are per staff, allow many rows per date and have no name; a separate table keeps one-per-date and the holiday suggestions clean |
| `staff_breaks` | `staff_id uuid not null`, `label text not null default 'Break'` (1..60), `start_time time`, `end_time time` (end > start, 00:00-24:00), `weekdays smallint[] not null default '{}'` | named recurring break, `weekdays` empty = every day the staff member works. Trigger `private.guard_staff_break` normalises weekdays (sorted, distinct) and rejects two breaks of one staff member that overlap in time on a shared weekday (`RULE:OVERLAPPING_BREAKS`) |
| `staff_time_off` | `staff_id uuid not null`, `starts_on date`, `ends_on date` (>= starts_on, at most 366 days apart), `start_time time null`, `end_time time null`, `reason time_off_reason` (`leave` \| `sick` \| `training` \| `other`, default `other`), `note text` (<= 500) | absence. Both times null = **all day on every date**; both set = **those hours on EACH date of the range** (a multi-day range with times repeats the times daily; there is no "first day from 14:00, last day until 10:00"). Overlapping rows are allowed |
| `clients` | `phone_e164 text not null check ~ '^\+[1-9][0-9]{6,14}$'`, `name text`, `email text`, `notes text`, `tags text[] not null default '{}'`, `is_blocked bool not null default false`, `whatsapp_opt_in bool not null default true`, `first_seen_at timestamptz not null default now()`, `last_seen_at timestamptz` | unique(`business_id`,`phone_e164`) |
| `client_notes` | `client_id uuid not null`, `body text not null`, `kind text not null default 'general' check in ('general','warning','preference')`, `created_by text` | "Important notes" in the mockup |
| `appointments` | `client_id`, `staff_id`, `service_id` (FKs, not null), `slot tstzrange not null` (`[)`), `blocked tstzrange not null` (slot + business buffer, set by RPC), `status appointment_status not null default 'confirmed'`, `source appointment_source not null`, `price_cents int not null`, `duration_minutes int not null`, `notes text`, `idempotency_key text unique`, `checked_in_at timestamptz`, `cancelled_at timestamptz`, `cancel_reason text`, `created_by text` | **`EXCLUDE USING gist (staff_id WITH =, blocked WITH &&) WHERE (status <> 'cancelled')`**. Index on (business_id, lower(slot)) |
| `appointment_events` | `appointment_id uuid not null`, `type appointment_event_type`, `actor actor_type`, `actor_id text`, `payload jsonb not null default '{}'`, `occurred_at timestamptz not null default now()` | unique index on `(appointment_id, (payload->>'offset_minutes'))` where `type='reminder_sent'` |
| `audit_log` | `id bigint identity pk`, `business_id uuid null`, `actor actor_type`, `actor_id text`, `action text` (insert/update/delete), `entity text`, `entity_id text`, `diff jsonb`, `request_id text`, `occurred_at timestamptz default now()` | written by trigger on businesses, services, staff, staff_services, business_hours, availability_rules, availability_overrides, business_special_days, staff_breaks, staff_time_off, clients. The actor comes from `current_setting('app.actor_id', true)` / `app.request_id` |
| `whatsapp_accounts` | `business_id unique`, `waba_id text not null`, `phone_number_id text unique not null`, `display_phone text`, `verified_name text`, `access_token_ciphertext text`, `token_expires_at timestamptz`, `flow_ids jsonb not null default '{}'` (`{"booking": "...", "reschedule": "..."}`), `status wa_account_status not null default 'pending'`, `quality_rating text`, `messaging_limit text`, `last_health_check_at timestamptz`, `last_error text` | **The app must never be able to read `access_token_ciphertext`** (column grants) |
| `message_templates` | `whatsapp_account_id uuid not null`, `name text`, `category text`, `language text not null default 'en'`, `meta_template_id text`, `status template_status not null default 'draft'`, `rejection_reason text`, `components jsonb` | unique(whatsapp_account_id, name, language) |
| `conversations` | `client_id uuid not null`, `state text not null default 'idle'` (check in the list in §5), `context jsonb not null default '{}'`, `version int not null default 0` (optimistic lock), `invalid_input_count int not null default 0`, `window_expires_at timestamptz`, `last_inbound_at timestamptz`, `last_message_at timestamptz` | unique(business_id, client_id): one thread per client |
| `messages` | `conversation_id uuid not null`, `direction message_direction`, `wa_message_id text unique`, `type message_type`, `body jsonb not null`, `status message_status not null`, `error jsonb`, `sent_by text` (staff user id), `sent_at`, `delivered_at`, `read_at` | |
| `webhook_events` | `source text not null` (`whatsapp`/`clerk`), `event_key text not null`, `whatsapp_account_id uuid null`, `payload jsonb not null`, `received_at timestamptz default now()`, `processed_at timestamptz`, `error text`, `attempts int default 0` | unique(source, event_key) for dedupe and replay. No business_id (nullable via account). Service role only |
| `escalations` | `conversation_id uuid not null`, `client_id uuid not null`, `reason text not null` (`customer_requested`/`unrecognised_input`/`unlinked_number`/`delivery_failed`/`flow_error`/`cancellation_window`), `status escalation_status not null default 'open'`, `assigned_user_id text`, `note text`, `resolved_at`, `resolved_by text` | partial unique: one open per conversation |
| `idempotency_keys` | `key text pk`, `business_id uuid null`, `endpoint text not null`, `request_hash text not null`, `status_code int`, `response jsonb`, `expires_at timestamptz not null default now()+'7 days'` | service role only |
| `booking_attempts` | `channel booking_channel`, `client_id uuid null`, `conversation_id uuid null`, `session_key text` (flow token / web session), `started_at timestamptz not null default now()`, `completed_at timestamptz`, `step_count int not null default 0`, `outcome attempt_outcome not null default 'in_progress'`, `appointment_id uuid null`, `error_code text`, `steps jsonb not null default '[]'` (`[{step, at}]`) | FR21 research instrumentation |
| `device_push_tokens` | `user_id text not null`, `token text unique not null`, `platform text` | Expo push for new bookings/escalations and the attendance check |
| `attendance_checks` | `appointment_id uuid not null unique` (FK `(business_id, appointment_id)`), `audience text not null check in ('staff','owner')`, `recipient_user_id text null` (staff mode: the user linked to the appointment's staff member; null when nobody is linked or in owner mode), `status text not null default 'pending' check in ('pending','answered')`, `outcome text null check in ('came','no_show','resolved_elsewhere')`, `notified_at`, `escalated_at`, `answered_at timestamptz null`, `answered_by text null` | The attendance check (migration `20261021000001_attendance_checks`): one "did the client come?" question per appointment. A check constraint ties `status`/`outcome`/`answered_at` together. RLS: business-scoped SELECT for `authenticated`, no write policies (service role only). In the Realtime publication |
| `attendance_pushes` | `user_id text not null`, `kind text check in ('check','batch','summary')`, `check_ids uuid[] not null`, `local_date date not null`, `sent_at timestamptz not null default now()` | Push log for the attendance check (30 min gap, batching, one summary per day). RLS on, no policy: service role only |

Default `booking_rules`:
```json
{ "lead_time_minutes": 60, "cancellation_window_minutes": 1440, "buffer_minutes": 0,
  "slot_interval_minutes": 15, "booking_horizon_days": 60, "reminder_offsets_minutes": [1440, 120],
  "allow_staff_selection": true }
```

### RLS
- `private.current_org_id()` = `coalesce(auth.jwt()->>'org_id', auth.jwt()->'o'->>'id')` (Clerk v1 and v2 session tokens).
- `private.current_business_id()` = business whose `clerk_org_id` = current org (security definer, stable).
- Every table has RLS enabled. `authenticated` gets a **SELECT** policy `business_id = private.current_business_id()` (for `businesses`, `id = …`). There are no insert/update/delete policies for `authenticated`. `webhook_events` and `idempotency_keys` have no policies (service role only).
- Realtime publication: `appointments`, `conversations`, `messages`, `escalations`, `clients`, `attendance_checks`, plus the schedule-config tables `business_hours`, `business_special_days`, `availability_rules`, `availability_overrides`, `staff_breaks`, `staff_time_off` (migration `20261029000002`; the app invalidates the calendar hours on change; RLS `members_select` applies per subscriber).

### RPCs (WS-A writes, WS-B/C call via service role)
All raise with SQLSTATE-coded errors that the API maps:
`23P01` → `SLOT_UNAVAILABLE`, `P0002` → `NOT_FOUND`, `P0001` with message prefix `RULE:<CODE>` → 422 `<CODE>` (e.g. `RULE:STAFF_NOT_QUALIFIED`, `RULE:SERVICE_INACTIVE`, `RULE:CLIENT_BLOCKED`, `RULE:STAFF_INACTIVE`, `RULE:INVALID_STATUS`).

1. `create_appointment(p_business_id uuid, p_client_id uuid, p_staff_id uuid, p_service_id uuid, p_starts_at timestamptz, p_source appointment_source, p_idempotency_key text, p_actor actor_type, p_actor_id text, p_notes text default null) returns appointments`. If `p_idempotency_key` already exists for the same business, returns that row unchanged. Snapshots duration and price from the service, sets `slot=[start, start+duration)` and `blocked=[start, start+duration+buffer)`, validates the service is active, the staff is active, accepts bookings and is qualified, and the client is not blocked. Inserts the appointment and a `created` event.
2. `reschedule_appointment(p_appointment_id uuid, p_starts_at timestamptz, p_staff_id uuid default null, p_actor actor_type, p_actor_id text) returns appointments`. Only a `confirmed` appointment can be rescheduled. Recomputes slot/blocked and inserts a `rescheduled` event with `{from, to, from_staff_id, to_staff_id}`.
3. `cancel_appointment(p_appointment_id uuid, p_actor actor_type, p_actor_id text, p_reason text default null) returns appointments`. `confirmed → cancelled`, plus a `cancelled` event.
4. `set_appointment_status(p_appointment_id uuid, p_status appointment_status, p_actor actor_type, p_actor_id text) returns appointments`. Allows `confirmed → completed | no_show` plus a matching event.
5. `check_in_appointment(p_appointment_id uuid, p_actor_id text) returns appointments`. Sets `checked_in_at` plus a `checked_in` event.
6. `upsert_client_by_phone(p_business_id uuid, p_phone_e164 text, p_name text default null) returns clients`. Inserts or bumps `last_seen_at`, and only fills `name` if it is currently null.
7. `claim_due_reminders(p_now timestamptz, p_limit int default 100) returns table(appointment_id uuid, business_id uuid, client_id uuid, offset_minutes int, starts_at timestamptz)`. For confirmed appointments with `lower(slot) > p_now` and an offset in the business's `reminder_offsets_minutes` where `lower(slot) - offset <= p_now` and no `reminder_sent` event exists for that offset, it atomically inserts `reminder_sent` events (`payload {offset_minutes, state:'claimed'}`) and returns them. Skips offsets whose window already passed by more than 30 min.
8. `dashboard_summary(p_date date) returns jsonb`. **Callable by `authenticated`** and uses `private.current_business_id()`. Returns `{ month_revenue_cents, revenue_by_day: [{date, cents}], today: {total, confirmed, completed, cancelled, no_show, checked_in}, next_appointment_id }` (revenue = completed + confirmed, excluding cancelled/no-show).
9. `replace_business_hours(p_business_id uuid, p_rows jsonb)`, `replace_staff_availability(p_staff_id uuid, p_rows jsonb)`, `replace_staff_breaks(p_staff_id uuid, p_rows jsonb)` and `replace_staff_services(p_staff_id uuid, p_service_ids uuid[])`. Each is an atomic full-replace (service role only). Hours and availability take at most **one range per weekday** (`RULE:ONE_RANGE_PER_DAY`, `RULE:INVALID_HOURS`) and are applied as an upsert per weekday so a changed range keeps its row id and audit history. Breaks take `[{label?, start_time, end_time, weekdays?}]`, normalise and de-duplicate them, and reject overlaps (`RULE:OVERLAPPING_BREAKS`) or bad rows (`RULE:INVALID_BREAK`); unchanged breaks keep their id. Migration `20261018000001_availability_model.sql` also holds `private.convert_split_availability()`: it turned every old split day into one range plus a `Lunch` break per affected staff member (gaps of `span(own) ∩ span(business)` minus the old effective windows, so nothing previously unbookable became bookable), and business-wide overrides into special days (a closed row wins; split open windows become one range with the gap kept closed as partial staff time off).
10. `set_request_context(p_actor_id text, p_request_id text)` sets the `app.*` GUCs for the audit trigger (the API calls it inside RPCs where it matters; triggers fall back to `system`).
11. `complete_onboarding(p_business_id uuid, p_user_id text, p_owner_name text, p_hours jsonb, p_team jsonb, p_services jsonb) returns boolean`. First-run setup in ONE transaction under a `for update` lock on the business: owner staff row (reused if the user already has one), hours (via `replace_business_hours`), team staff, services, `staff_services` (every service offered by owner + team), then `businesses.onboarded_at = now()` last. Returns `true` when it applied, `false` when `onboarded_at` was already set (a retry or racing duplicate changes nothing). Any invalid row rolls everything back. `service_role` only. Businesses that already had hours or services were backfilled as onboarded.
12. `record_audit_event(p_business_id uuid, p_actor_id text, p_action text, p_entity text, p_entity_id text, p_diff jsonb default null, p_request_id text default null)`. Inserts an `audit_log` row for changes the row triggers cannot see (Clerk membership: entities `team_invitation`, `team_member`). `service_role` only. Also adds the partial unique index `staff_business_user_key (business_id, user_id) where user_id is not null`: one staff row per login per business.
13. `month_report(p_business_id uuid, p_month date, p_now timestamptz default now()) returns jsonb`: `{ completed_jobs, revenue_cents (sum of price_cents over the completed jobs), bookings_created: {whatsapp, nerova, app, web} (the RPC still returns the legacy `nerova` key; the report service maps `app` to `manual` and ignores `nerova`) (created_at in the month, any status), no_shows, cancellations (appointments STARTING in the month), busiest: {weekday 0=Sunday, hour} | null (completed jobs by local start, ties to the earliest), weekly: [{week_start (Monday), completed_jobs}] (every Monday-start week touching the month, zeros included; a job belongs to the week of its local end date) }`. `service_role` only.

pg_cron (guarded migration) calls the API via `pg_net` with header `x-cron-secret`, using settings from Vault (`api_base_url`, `cron_secret`):
`reminders` every 5 min · `conversation-expiry` every 15 min · `waba-health` hourly · `token-refresh` daily 03:00 · `cleanup` daily 03:30 · `attendance` every 5 min (migration `20261021000002_cron_attendance`, see "Attendance check" below) · `warm` every minute (migration `20261020000001_cron_warm`: `/cron/warm` does no I/O and only keeps an `api` isolate loaded). The handlers live in `CRON_JOBS` (`apps/api/src/routes/cron.ts`). Three older schedules (`api-client-notifications`, `api-stories`, `api-billing-usage`) are still created by old migrations but their routes no longer exist: they get 404 (see *Free edition: leftovers*).

## 4. API contract (apps/api/, Hono on Supabase Edge Functions)

Base URL: `https://<project-ref>.supabase.co/functions/v1/api` (the paths below are relative to it).

Envelope: success `{ "data": … }`. Error `{ "error": { "code", "message", "details"?, "request_id" } }`.
Headers: `Authorization: Bearer <Clerk session JWT>` on `/v1/**`. `Idempotency-Key: <uuid>` is **required** on every mutating `/v1/**` and `/public/**` call. Every response carries `x-request-id`.
Error codes (`ApiErrorCode` in `packages/types/api.ts`): `VALIDATION_FAILED 400`, `IDEMPOTENCY_KEY_REQUIRED 400`, `UNAUTHENTICATED 401`, `FORBIDDEN 403` (includes staff hitting owner-only routes), `NO_BUSINESS 403`, `NOT_FOUND 404`, `SLOT_UNAVAILABLE 409`, `WINDOW_CLOSED 409`, `IDEMPOTENCY_KEY_REUSED 422`, `RULE_VIOLATION 422` (with `details.rule`), `RATE_LIMITED 429`, `UPSTREAM_META_ERROR 502`, `INTERNAL 500`. A `RATE_LIMITED` with `details.retry_after_s` also sets the `Retry-After` header.

DTO shapes live in `packages/types/api.ts`.

**WS-B, booking core**
| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/health` | public | |
| GET | `/v1/me` | member | `MeDTO` `{ user, business, role }` |
| POST | `/v1/onboarding` | org owner (no business needed) | `OnboardingRequest` → `MeDTO`. Auth is the verified Clerk token only: active org id from the token, role `org:admin`, else `NO_BUSINESS` 403 / `FORBIDDEN` 403. Upserts the business (`clerkSync.upsertBusiness`), owner user and owner staff row (`ensureMember`), then applies hours (at least one row), owner staff, team and services (every bookable staff member qualified) atomically through `complete_onboarding`. Idempotent: a business with `onboarded_at` set (or that already has hours, services or extra staff) is returned unchanged, so a failed attempt can simply be retried, a racing double submit cannot duplicate staff or services, and a late Clerk webhook merges instead of duplicating. The `Idempotency-Key` is scoped to the verified org + user (there is no business yet), so another org reusing the same key never sees this response. The app opens as soon as this succeeds: there is no plan step. Config rows are audited by the `audit_log` triggers |
| PATCH | `/v1/business` | owner | details + `booking_rules` (partial merge) + `attendance_mode` (`'staff'` default or `'owner'`; anything else is `VALIDATION_FAILED` 400). A change writes an `audit_log` entry (`entity: attendance_mode`, diff `{attendance_mode: {old, new}}`, actor = the owner). `BusinessDTO` and `MeDTO.business` carry `attendance_mode` |
| PUT | `/v1/business/hours` | owner | full week replace `{ hours: BusinessHoursRow[] }`. **At most one row per weekday**: two rows on a weekday fail `VALIDATION_FAILED` 400 (a lunch gap is a staff break). The same rule applies to `hours` in `POST /v1/onboarding` |
| POST/PATCH/DELETE | `/v1/services[/:id]` | owner | DELETE = soft (is_active=false) if referenced |
| POST/PATCH/DELETE | `/v1/staff[/:id]` | owner | |
| PUT | `/v1/staff/:id/services` | owner | `{ service_ids }` |
| PUT | `/v1/staff/:id/availability` | owner | `{ rules: AvailabilityRuleInput[] }`, at most one rule per weekday (else `VALIDATION_FAILED` 400); `[]` = inherit business hours |
| POST | `/v1/overrides` | owner | per-staff day override `CreateOverrideRequest`: `staff_id` is **required** (business-wide days are special days, a missing `staff_id` is `VALIDATION_FAILED`) → `StaffDayOverrideDTO` (201) |
| DELETE | `/v1/overrides/:id` | owner | |
| GET | `/v1/availability/config?from&to` | member | `AvailabilityConfigResponse`: `business_hours`, `special_days` in range, and per staff (`StaffAvailabilityConfigDTO`) `rules`, `breaks`, `time_off` overlapping the range and `overrides` in range. `from`/`to` inclusive `YYYY-MM-DD`, to >= from, at most 366 days. One call renders the hours, holidays, breaks and time-off screens |
| GET | `/v1/special-days/suggestions?year=` | member | `SpecialDaySuggestionsResponse`: the South African public holidays of `year` (2000-2100), computed by the pure `southAfricanPublicHolidays` (fixed dates, Good Friday and Family Day from Easter, Sunday holiday moves to the Monday per Public Holidays Act 36 of 1994 s 2(1); a Monday already taken moves on to the next free day). Each entry has `added` / `special_day_id` when a special day already exists that date. One-off proclaimed days are not included |
| POST | `/v1/special-days` | owner | `CreateSpecialDayRequest` `{ date, name, kind, is_closed?, start_time?, end_time? }` → `SpecialDayDTO` (201). `is_closed` defaults to true except for `special_hours`. One per date (else `VALIDATION_FAILED`, `details.special_day_id`). A closed day blocks bookings immediately and **never cancels existing appointments** (preview them with `/v1/availability/conflicts` first) |
| PATCH | `/v1/special-days/:id` | owner | `UpdateSpecialDayRequest` (partial); the merged result is validated like a create → `SpecialDayDTO` |
| DELETE | `/v1/special-days/:id` | owner | → `{ id }`; `NOT_FOUND` when unknown |
| PUT | `/v1/staff/:id/breaks` | owner | `ReplaceStaffBreaksRequest` `{ breaks: StaffBreakInput[] }` (atomic replace, `[]` clears, max 20) → `ReplaceStaffBreaksResponse`. Overlapping breaks on a shared weekday: `RULE_VIOLATION` 422 `details.rule = OVERLAPPING_BREAKS`; bad rows `VALIDATION_FAILED` |
| POST | `/v1/staff/:id/time-off` | owner | `CreateStaffTimeOffRequest` `{ starts_on, ends_on?, start_time?, end_time?, reason?, note? }` → `StaffTimeOffDTO` (201). `ends_on` defaults to `starts_on`; times both or neither; times apply on each date of the range |
| PATCH | `/v1/time-off/:id` | owner | `UpdateStaffTimeOffRequest` (partial; `start_time: null, end_time: null` makes it all-day) → `StaffTimeOffDTO` |
| DELETE | `/v1/time-off/:id` | owner | → `{ id }` |
| GET | `/v1/availability/conflicts?from[&to][&staff_id][&start_time&end_time][&mode]` | member | `AvailabilityConflictsResponse` `{ conflicts: AppointmentDTO[] }`: the **confirmed** appointments a proposed special day (omit `staff_id`) or time off (`staff_id`) would overlap. `to` defaults to `from`. No times = whole days; both times = those hours on each date. `mode=closed` (default) = the window becomes unavailable; `mode=open_only` (needs times) = only the window stays open, so appointments outside it conflict (special hours). Read-only: nothing is cancelled or moved, the app decides |
| POST/PATCH | `/v1/clients[/:id]` | member | phone normalised to E.164 (default region ZA) |
| POST/DELETE | `/v1/clients/:id/notes[/:noteId]` | member | |
| GET | `/v1/availability/days?service_id&from&to[&staff_id]` | member | `{ days: string[] }` |
| GET | `/v1/availability/slots?service_id&date[&staff_id]` | member | `{ slots: SlotDTO[] }` |
| POST | `/v1/appointments` | member | `CreateAppointmentRequest`. A booking must fall inside live availability, so it is rejected `SLOT_UNAVAILABLE` 409 inside a staff break, staff time off or a closed special day as well as outside hours. `allow_outside_hours` (staff walk-ins) skips every one of those checks (overlap with another appointment is still enforced by the exclusion constraint) |
| POST | `/v1/appointments/:id/reschedule` | member | `{ starts_at, staff_id?, notify_customer? }` |
| POST | `/v1/appointments/:id/cancel` | member | `{ reason?, notify_customer? }` |
| POST | `/v1/appointments/:id/status` | member | `{ status: 'completed' \| 'no_show' }` |
| POST | `/v1/appointments/:id/check-in` | member | |
| PATCH | `/v1/appointments/:id` | member | `{ notes }` |
| POST | `/v1/devices` | member | `{ token, platform }` |
| DELETE | `/v1/devices` | member | `{ token }` removes the caller's own token (sign-out / push switched off) |
| GET | `/v1/attendance/pending` | member | `AttendancePendingResponse` `{ count, checks: AttendanceCheckDTO[] }`, oldest first: the caller's open questions, i.e. those addressed to them (`recipient_user_id`), plus, for an owner, owner-mode and escalated ones. Questions whose appointment is no longer `confirmed` are left out |
| POST | `/v1/attendance/:checkId/answer` | member (the recipient or an owner) | `{ outcome: 'came' or 'no_show' }` → `AttendanceCheckDTO`. Sets the appointment to `completed` / `no_show` through `BookingService.setAppointmentStatus` (so `appointment_events` behave as for `/status`; actor `staff`, id = caller) and closes the question (`answered_by`, `answered_at`, `outcome`). Another staff member: `FORBIDDEN` 403; unknown id or another business: `NOT_FOUND` 404. Replaying the same outcome returns the closed question; a different outcome on a closed question is `RULE_VIOLATION` 422 `details.rule = ATTENDANCE_ALREADY_ANSWERED`. If the appointment already left `confirmed` (or does so mid-request) nothing is changed and the question closes with `outcome: 'resolved_elsewhere'`. `Idempotency-Key` required |
| GET | `/v1/team` | owner | `{ members: TeamMemberDTO[], invitations: TeamInvitationDTO[] }`. Members come from the Clerk organisation of the **token's** org (never a client-sent org), enriched with `staff_id` (the staff row whose `user_id` is that login) and `is_self`. Invitations are Clerk's `pending` ones |
| POST | `/v1/team/invitations` | owner | `{ email, role: 'owner'\|'staff', staff_id? }` → `TeamInvitationDTO` (201). Creates a Clerk organisation invitation (`org:admin` / `org:member`) with `public_metadata.staff_id`; if `staff_id` is given and `staff.email` is blank it is set to the invited email. `RULE_VIOLATION` 422 with `details.rule` `ALREADY_MEMBER` (email belongs to a member), `ALREADY_INVITED` (pending invitation for that email) or `STAFF_ALREADY_LINKED` (staff row already has a login); `NOT_FOUND` for an unknown `staff_id`. Idempotent through `Idempotency-Key`. Audited in `audit_log` (`team_invitation`) |
| DELETE | `/v1/team/invitations/:id` | owner | revokes a pending invitation → `{ id, revoked: true }`; `NOT_FOUND` when it is not pending. Audited |
| PATCH | `/v1/team/members/:userId` | owner | `{ role }` → `TeamMemberDTO`. Updates the Clerk membership role and `users.role`. `RULE_VIOLATION` `details.rule = LAST_OWNER` when it would leave the business without an owner; `NOT_FOUND` when the user is not a member. Audited (`team_member`, diff `role {old,new}`) |
| DELETE | `/v1/team/members/:userId` | owner | removes the Clerk membership, clears `users.business_id` and `staff.user_id` for that login → `{ user_id, removed: true }`. The staff row stays (appointments reference it; deactivate it with `PATCH /v1/staff/:id`). `LAST_OWNER` as above. Audited |
| GET | `/v1/me/deletion-preview` | member (Clerk session) | → `AccountDeletionPreviewDTO` `{ business_deleted, business_name, other_member_count }`: `business_deleted` is true when the caller is the only owner |
| DELETE | `/v1/me` | member, `Idempotency-Key` | Self-service account deletion (Google Play / App Store). Optional body `DeleteAccountRequest` `{ confirm_business_name? }`, required (exact name, case-insensitive) when the caller is the only owner, else 422 `RULE_VIOLATION` `details.rule = BUSINESS_NAME_MISMATCH`. Revokes the caller's Expo push tokens, deletes the Clerk user (and the Clerk organisation for a confirming sole owner), audits `audit_log` (entity `account`, diff `{ role, business_deleted }`), anonymises the linked staff row (name `Former team member`, email/phone/photo/title cleared, inactive) unless the business goes, then the existing Clerk `user.deleted` / `organization.deleted` webhooks delete the `users` row or the business and its data (no deletion logic is duplicated). Clerk is called first: a Clerk failure changes nothing local and can be retried → `{ deleted: true, business_deleted }` |
| GET | `/public/b/:slug` | public | business + active services + bookable staff |
| GET | `/public/b/:slug/availability/days` · `/slots` | public | same as v1 |
| POST | `/public/b/:slug/attempts` | public | start a web attempt → `{ attempt_id }` |
| POST | `/public/attempts/:id/steps` | public | `{ step }` records step + timestamp |
| POST | `/public/b/:slug/bookings` | public | `{ attempt_id, service_id, staff_id?, starts_at, name, phone, email? }` |
| POST | `/webhooks/clerk` | Svix-signed | org/user/membership mirror |
**Team and login linking.** A business is a Clerk organisation; `org:admin` → `owner`, `org:member` → `staff` (`roleFromClerk`). Calendar people are `staff` rows and may have no login. Team routes go through the `ClerkAdmin` port (`ports.ts`; fetch client `lib/clerkAdmin.ts` against `https://api.clerk.com/v1` with `CLERK_SECRET_KEY`). Without the Clerk webhook, `requireAuth` mirrors the caller on first contact (`booking/memberSync.ts`, re-checked at most every 5 min per instance): `users` row with the role from the verified token, then a staff link, in this order: (1) the staff row named by the invitation's `public_metadata.staff_id` (Clerk copies it onto the membership; must be in the business and unlinked), (2) an unlinked **active** staff row with the same email (case-insensitive), (3) a new staff row named from the Clerk name. The `organizationMembership.created` webhook uses the same `ensureMember` logic. If Clerk is unreachable the user row is still mirrored, no placeholder staff row is created, and the sync retries on the next request. Staff-role members use every member route and none of the owner routes (`requireOwner` → `FORBIDDEN` 403, including all `/v1/team/**`).

"No preference" staff (`staff_id` omitted/null) resolves deterministically. The engine picks, among qualified staff free for the slot, the one with the fewest appointments that day, with ties broken by `sort_order` then `id`.

**WS-C, WhatsApp**
| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/webhooks/whatsapp` | Meta | `hub.mode/verify_token/challenge` |
| POST | `/webhooks/whatsapp` | Meta, `X-Hub-Signature-256` | messages, statuses, template status, account updates |
| POST | `/flows/whatsapp` | Meta Flows (encrypted) | data_exchange endpoint (ping, INIT, data_exchange, BACK, error ack) |
| GET | `/v1/whatsapp` | member | channel status + templates |
| POST | `/v1/whatsapp/embedded-signup` | owner | `{ code, waba_id, phone_number_id }` → exchange, subscribe, register, upload flow key, create flows + templates |
| POST | `/v1/whatsapp/connect` | owner | manual connect with an existing system-user token `{ waba_id, phone_number_id, access_token }` |
| POST | `/v1/whatsapp/sync` | owner | re-sync templates, flows and phone health |
| POST | `/v1/whatsapp/pause` · `/resume` · `/disconnect` | owner | |
| POST | `/v1/whatsapp/test-message` | owner | `{ to }` sends hello_world/template |
| POST | `/v1/conversations/:id/messages` | member | staff free-text reply (only inside the 24h window, else `WINDOW_CLOSED`) |
| POST | `/v1/conversations/:id/release` | member | hand back to the bot (state → `menu`) |
| POST | `/v1/escalations/:id/resolve` | member | `{ note? }` |
| POST | `/cron/reminders` · `/cron/conversation-expiry` · `/cron/waba-health` · `/cron/token-refresh` · `/cron/attendance` · `/cron/cleanup` · `/cron/warm` | cron secret (`x-cron-secret`) | One route, `/cron/:job`, registered in `CRON_JOBS`; GET is also accepted for manual triggering. `cleanup` expires idempotency keys, prunes processed webhook events older than 30 days and abandons stale web attempts. `warm` returns `{ data: { job: 'warm', result: {} } }` without touching the database |

### Attendance check

After an appointment ends, the right person is asked whether the client came, and the status follows their answer. **The server never sets `no_show` on its own**: an unanswered question stays pending forever. Code: `packages/features/attendance/` (pure planner `lib/planner.ts`, executor `services/attendanceJob.ts`, use cases `services/attendanceService.ts`), route `apps/api/src/routes/v1/attendance.ts`, job `attendance` in `CRON_JOBS`.

- **Who answers** (`businesses.attendance_mode`): `staff` (default, recommended) asks the user linked to the appointment's staff member; `owner` asks every owner. In staff mode the owner(s) are also asked, once (`escalated_at`), when the staff member has no linked user or no registered device, or 60 min after the first push without an answer.
- **Job** (`POST/GET /cron/attendance`, every 5 min, injected clock, counts `created, completed, escalated, pushes, closed, errors`): (1) closes pending questions whose appointment left `confirmed` (`resolved_elsewhere`); (2) for `confirmed` appointments that ended 10+ min ago (and no more than 90 min ago: `CREATE_WINDOW_MINUTES`, never backfilled) and have no question: **checked in** (`checked_in_at`) means silently `completed` through `BookingService` (actor `system`), otherwise one question is inserted (unique per appointment); (3) escalates staff questions to the owner(s) 60 min after `notified_at` (never `created_at`), only when an owner has a device and the question has actually been notified, otherwise it stays pending; (4) sends pushes; (5) sends the end-of-day summary.
- **Pushes** (Expo, via `createPushSender().toUsers`): at most one per recipient per 30 min (`attendance_pushes`); several open questions for a recipient become ONE grouped push; a question is pushed once per recipient (answered ones never again); only between opening and closing + 1 h of the business-local day (no hours row = unrestricted); text uses the business timezone. Summary at closing + 30 min (until closing + 1 h) when the recipient still has unanswered questions about today's appointments, once per local day, instead of the regular push. A push that reaches no device is not logged and is retried next run. There is no per-user notification preference model yet, so there is no `attendance` toggle.
- **Push payloads** (Expo `data` values are strings; types in `@booking/types` `AttendancePushData`):
  - one question: `title: 'Appointment check'`, `body: 'Did <ClientFirstName> make it to their <HH:mm> <service>?'`, `categoryId: 'attendance_check'`, `data: { type: 'attendance_check', checkId, appointmentId }`
  - several: `body: '<n> clients to confirm'`, `data: { type: 'attendance_batch', count }` (no category)
  - end of day: `body: '<n> appointments still need confirming'` (`1 appointment still needs confirming`), `data: { type: 'attendance_summary', count }`
- **App reads**: `GET /v1/attendance/pending` (caller-scoped, joined with client first name and service) is the list API; `attendance_checks` is also RLS-readable and in the Realtime publication so the app can invalidate the list when a row changes. Writes only go through `POST /v1/attendance/:checkId/answer`.


## 5. Deterministic conversation engine (WS-C)

States (the `conversations.state` check constraint must list exactly these):
`idle, menu, flow_booking, flow_reschedule, select_service, select_staff, select_date, select_slot, confirm, manage_booking, manage_appointment, reschedule_select_date, reschedule_select_slot, reschedule_confirm, cancel_confirm, escalated, closed`

- Pure function `transition(snapshot, input) → { state, context, actions[] }` with no I/O. Inputs are *typed events* built from webhooks: `{kind:'text'}` (content ignored), `{kind:'button', id}`, `{kind:'list', id}`, `{kind:'flow_completed', valid, flow, attemptId, appointmentId, booking?, reschedule?, flowToken?}` (a booking Flow's `booking` payload is booked, and a reschedule Flow's `reschedule` payload is moved, by the engine), `{kind:'template_button', payload}`, `{kind:'unsupported'}`. An executor performs actions (send message, create booking via `BookingService`, escalate, record attempt step).
- Reply IDs are structured and parsed by prefix, never by text: `menu:book`, `menu:bookings`, `menu:help`, `svc:<uuid>`, `stf:<uuid|any>`, `day:<YYYY-MM-DD>`, `days:more:<page>`, `slot:<iso>|<staffId>`, `cfm:yes`, `cfm:no`, `appt:<uuid>`, `appt:resched:<uuid>`, `appt:cancel:<uuid>`, `nav:back`, `nav:menu`.
- Any message in `idle`/`closed` shows the main menu (reply buttons **Book**, **My bookings**, **Talk to us**). Book uses the booking **Flow** when `flow_ids.booking` is live, otherwise the list path (service → staff (if >1 and allowed) → date (paged 9 + "more") → slot → confirm). Reschedule uses the reschedule **Flow** (`reschedule_v2`) when `flow_ids.reschedule` is live, otherwise the list path. Cancel is always the list/button path. Both Flows end on a terminal `complete` screen and the engine performs the write on the `nfm_reply`.
- Input that doesn't match the current state increments `invalid_input_count` and re-sends the current step with a fixed prefix. On the 3rd strike the conversation escalates (`unrecognised_input`) with a fixed message.
- `escalated`: the bot sends one fixed ack then stays silent until staff `release`.
- 24h window: `window_expires_at = last_inbound_at + 24h`. Free-form/interactive outbound only goes out inside the window, templates outside it.
- Concurrency: state updates use `version` (compare-and-set). On conflict, reload and re-run.
- Every transition appends a `booking_attempts.steps` entry while an attempt is active.
- Templates (utility, `en`): `booking_confirmation`, `booking_reminder` (quick replies: Keep / Reschedule / Cancel → payload `appt:<id>` variants), `booking_rescheduled`, `booking_cancelled`.

## 6. Mobile app (WS-D)

Screens from the mockups (§5 of the spec) plus architecture §6: Sign-in · Calendar (Day/Week/Month, with today's schedule and a way to add a booking) · Reports (monthly figures) · Booking detail (message / reschedule / cancel, status actions) · Add booking (existing/new client, service, date, time from live slots, staff/no preference, notes, WhatsApp confirmation toggle) · Clients (search, All/Recent/VIP filters, paging) · Client profile (message, call, book, contact, notes, history) · Settings (profile, dark mode, push toggle, Business details, Operating hours, Services, Staff management, WhatsApp integration) · Inbox (conversations + escalations, thread, reply, release) · Onboarding (welcome, business type, business name) · Public web booking comparator `/book/[slug]` (web target, instrumented).

Stack: NativeWind v4 + react-native-reusables components inside the `@booking/ui` design system (`packages/ui`), lucide-react-native icons, `@clerk/expo` (prebuilt UI only) auth, TanStack Query for server state, Supabase JS (`accessToken` from Clerk) for reads and Realtime, and `apps/mobile/src/lib/api.ts` for writes (bearer + Idempotency-Key). Env: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`.

### Navigation, reports and what is not here

Tabs: **Calendar, Reports, Clients, Settings**, plus an **Inbox** bubble (conversations and escalations). New booking is reached from the Calendar. Onboarding is welcome, business type, business name; the app opens right after the business is named. There is **no plan screen, no companion/chat tab, no voice and no stories**, and nothing is gated by plan: every business has every feature in this edition. The WhatsApp menu is always on.

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/v1/reports/summary?month=YYYY-MM` | member | `ReportsSummaryDTO` `{ month, currency, completed_jobs, revenue_cents, bookings_created: { whatsapp, manual, web }, no_shows, cancellations, busiest, weekly }`. Built by the report service in `packages/features/reports` from the `month_report` RPC. Non-AI. `manual` is the `app` source (walk-in and phone bookings made in the app) |

- **Completed job:** an appointment whose end has passed, in the business-timezone month of its end time, with status not `cancelled` and not `no_show` (so `confirmed` and `completed` both count). `revenue_cents` is the sum of their `price_cents`. No-shows and cancellations are counted separately (appointments starting in the month).
- `bookings_created` counts bookings by `created_at` in the month, any status.

## 7. Backend environment

Defined in `apps/api/src/env.ts` (zod). Only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are required; everything else is optional and the feature that needs it fails loudly when missing.

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Injected by Supabase on the hosted Edge Function; set by hand for local runs and tests. Never ship the service-role key to the app |
| `CLERK_SECRET_KEY`, `CLERK_JWT_KEY` (PEM, networkless verify), `CLERK_AUTHORIZED_PARTIES` (csv), `CLERK_WEBHOOK_SECRET` | Clerk auth, team routes and the Svix webhook |
| `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION` (default `v23.0`), `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_FLOW_PRIVATE_KEY` (PEM), `WHATSAPP_FLOW_PRIVATE_KEY_PASSPHRASE`, `WHATSAPP_REGISTRATION_PIN` | Meta WhatsApp Cloud API and Flows. Optional: without them the app, calendar, web booking and reports still work |
| `TOKEN_ENCRYPTION_KEY` (32-byte base64, AES-256-GCM for Meta tokens), `FLOW_TOKEN_SECRET` | Secrets for stored Meta tokens and signed Flow tokens |
| `CRON_SECRET` | Shared secret pg_cron sends in `x-cron-secret` |
| `API_BASE_URL` | Public base URL of this API (used for the Flows `endpoint_uri`) |
| `PUBLIC_WEB_BOOKING_URL` | Base URL of the public web booking page |
| `EXPO_ACCESS_TOKEN` | Optional, Expo push |

Environments and secret handling: `docs/environments.md`.

## 8. Workstreams and sequencing

1. **Scaffold** (done first): this plan, `packages/types/api.ts`, backend skeleton (Hono app, env, db client, errors, logger with PII redaction, request-id, Clerk auth, idempotency middleware, ports + stubs, route mount points, Vitest).
2. **In parallel:** WS-A (DB), WS-B (booking core API), WS-C (WhatsApp engine), WS-D (app). Each works in its own folders, writes tests, and commits on its own branch.
3. **Integration:** merge, swap in the real `Database` types, reconcile RPC and column names, run typecheck, tests, SQL tests and lint, set up CI, update the README, open the PR.

Definition of done per workstream: typecheck clean, tests passing, no TODO stubs left in owned folders, and a short `docs/<workstream>.md` covering setup and any deviations from this plan.


## 9. Free edition: leftovers

The migrations were left untouched when the AI and paid parts were removed from the code. These objects still exist in the database and are unused. Clean them up with a new migration (never by editing a merged one):

- **Tables:** `plan_features`, `billing_subscriptions`, `voice_device_tokens`, `stories`, `story_views`, `story_events`, `product_updates`, `product_update_views`, `support_requests`.
- **Columns:** `businesses.plan`, `businesses.nerova_account_id`, `appointments.client_confirmed_at` and `client_confirmed_via`, `appointments.billing_reported_at`, and the hold/void columns added by the `hold_client_notifications` migration.
- **RPCs:** `business_features`, `confirm_appointment_by_client`, `void_appointment`, `claim_due_client_notifications`, `completed_jobs_in_month`, `billing_unreported_bookings`, `mark_bookings_billed`. `month_report` is still used.
- **Enums:** `plan_key`; the value `nerova` in `appointment_source` and `actor_type`; the event values `client_confirmed` and `voided`.
- **pg_cron:** `api-client-notifications`, `api-stories` and `api-billing-usage` are still scheduled and now hit a 404 (`Unknown cron job`). Unschedule them with `cron.unschedule(...)`.
- **Webhook source:** `webhook_events.source` may still accept `nerova` and `stripe`; no route writes them.
- **Types:** `packages/types/api.ts` keeps `AppointmentSource` and `ActorType` with `nerova` only because the database enums have it.