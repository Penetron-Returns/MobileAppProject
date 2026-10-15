# Build Plan: WhatsApp Booking Platform

Source spec: *ITMDA3 Deliverable 3, Group S14*. This file pins the contracts that every workstream builds against. If code and this file disagree, fix one of them in the same PR. Don't let them drift.

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
apps/mobile/                 Expo app (own package.json)                          → WS-D
  src/app/**                 Expo Router routes
  packages/ui/**             design system `@booking/ui` (tokens, primitives, components, patterns; RNR base)
  src/features/**            feature modules (calendar, clients, …)
  src/lib/**                 api client, supabase client, query client
apps/api/                API source: runtime-agnostic Hono app (own package.json, Vitest)
  src/app.ts                 route mounting                                       → scaffold
  src/env.ts, src/lib/**, src/middleware/**                                       → scaffold
  src/ports.ts               BookingService / NotificationService                 → scaffold
  src/booking/**             availability engine + booking service                → WS-B
  src/routes/v1/**           admin REST (except whatsapp/conversations)           → WS-B
  src/routes/public.ts       web-booking comparator API                           → WS-B
  src/routes/clerk.ts        Clerk webhook                                        → WS-B
  src/whatsapp/**            Graph client, state machine, Flows, signup           → WS-C
  src/notifications/**       confirmations, reminders, push                       → WS-C
  src/routes/whatsapp/**     webhook, flows endpoint, v1 whatsapp/inbox           → WS-C
packages/types/             TYPES ONLY (no runtime imports), used by app + API (@booking/types)
  api.ts                     DTOs + request/response contracts
packages/database/          Supabase project (@booking/database)
  database.types.ts          generated Supabase `Database` type                   → WS-A
  supabase/                  config.toml, migrations, seed, SQL tests (CLI runs with --workdir packages/database) → WS-A
    functions/api/           Edge Function entry (Deno) serving apps/api/src/app.ts under /api
packages/config/            shared tooling presets (@booking/config): prettier, API tsconfig, eslint base
docs/                        this plan + per-workstream docs
```

Time conventions: the API speaks ISO-8601 with an offset for instants (`2026-09-30T09:00:00.000Z`) and `YYYY-MM-DD` for calendar dates **in the business timezone**. Weekday is `0 = Sunday … 6 = Saturday` (same as JS `getDay()` and Postgres `extract(dow)`). Money is integer cents in `businesses.currency` (default `ZAR`). Default timezone is `Africa/Johannesburg`.

## 3. Database schema (WS-A implements, everyone codes against it)

Extensions: `pgcrypto`, `btree_gist`, `citext`, plus `pg_cron` and `pg_net` only in a separate migration guarded so local Postgres without them still migrates.

Schemas: tables live in `public`. Helpers (`current_business_id()`, audit trigger fn) live in `private`. Write RPCs live in `public`, with `EXECUTE` revoked from `anon` and `authenticated` and granted to `service_role` only, unless noted.

### Enums
- `member_role`: `owner | staff`
- `appointment_status`: `confirmed | cancelled | completed | no_show`
- `appointment_source`: `whatsapp | app | web | nerova` (`nerova` added by migration `20261015000001_nerova_actor_source`: bookings made by the Nerova companion)
- `appointment_event_type`: `created | rescheduled | cancelled | completed | no_show | checked_in | reminder_sent | confirmation_sent | notes_updated`
- `actor_type`: `customer | staff | system | nerova` (`nerova` added by migration `20261015000001_nerova_actor_source`; `actor_id` is `nerova` or `nerova:<conversationId>`)
- `wa_account_status`: `pending | live | needs_reauth | disconnected | paused`
- `template_status`: `draft | submitted | approved | rejected | paused | disabled`
- `message_direction`: `in | out`
- `message_type`: `text | interactive | flow | template | button | reaction | media | unknown`
- `message_status`: `received | queued | sent | delivered | read | failed`
- `escalation_status`: `open | resolved`
- `booking_channel`: `whatsapp | web | app`
- `attempt_outcome`: `in_progress | completed | abandoned | failed`
- `plan_key`: `free | starter | growth | pro` (internal ids only; display names and prices are not part of the contract)

### Tables
All have `id uuid pk default gen_random_uuid()` (unless noted) and `created_at timestamptz not null default now()`. Mutable tables also have `updated_at` maintained by a trigger. Every business-owned table has `business_id uuid not null references businesses on delete cascade`.

| Table | Columns (beyond id/created_at/updated_at/business_id) | Notes |
| --- | --- | --- |
| `businesses` | `clerk_org_id text unique not null`, `name text not null`, `slug citext unique not null`, `timezone text not null default 'Africa/Johannesburg'`, `currency char(3) not null default 'ZAR'`, `logo_url text`, `address text`, `phone text`, `email text`, `onboarded_at timestamptz null` (set last by `complete_onboarding`; null = setup not finished), `booking_rules jsonb not null default <below>`, `plan plan_key not null default 'free'`, `nerova_account_id text null` (cached Nerova `acct_` id, 1-200 chars) | no business_id. `plan` is written only by the service role (future billing webhook); the app has SELECT only and no API route changes it. `nerova_account_id` is written only by the API (service role) the first time a companion session resolves the Nerova account |
| `plan_features` | pk(`plan`, `feature`), `plan plan_key`, `feature text` (snake_case), `monthly_limit int null` (>= 0; null = no cap) | global catalogue, no business_id. RLS on, SELECT for `authenticated`, writes service role only. See *Plans and entitlements* below |
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
| `device_push_tokens` | `user_id text not null`, `token text unique not null`, `platform text` | Expo push for new bookings/escalations |

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
- Realtime publication: `appointments`, `conversations`, `messages`, `escalations`, `clients`.

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
11. `business_features(p_business_id uuid default null) returns table(plan plan_key, feature text, monthly_limit int)`. The plan and feature rows for one business (null = the caller's business from the JWT org). **SECURITY INVOKER**: `authenticated` only ever sees its own business through RLS, and `service_role` can ask for any. **Callable by `authenticated`**, like `dashboard_summary`.
12. `complete_onboarding(p_business_id uuid, p_user_id text, p_owner_name text, p_hours jsonb, p_team jsonb, p_services jsonb) returns boolean`. First-run setup in ONE transaction under a `for update` lock on the business: owner staff row (reused if the user already has one), hours (via `replace_business_hours`), team staff, services, `staff_services` (every service offered by owner + team), then `businesses.onboarded_at = now()` last. Returns `true` when it applied, `false` when `onboarded_at` was already set (a retry or racing duplicate changes nothing). Any invalid row rolls everything back. `service_role` only. Businesses that already had hours or services were backfilled as onboarded.
13. `record_audit_event(p_business_id uuid, p_actor_id text, p_action text, p_entity text, p_entity_id text, p_diff jsonb default null, p_request_id text default null)`. Inserts an `audit_log` row for changes the row triggers cannot see (Clerk membership: entities `team_invitation`, `team_member`). `service_role` only. Also adds the partial unique index `staff_business_user_key (business_id, user_id) where user_id is not null`: one staff row per login per business.
14. `completed_jobs_in_month(p_business_id uuid, p_month date, p_now timestamptz default now()) returns integer` (migration `20261019000001_companion_usage`). The billable unit. A **completed job** is an appointment whose **end** (`ends_at`) has passed (`ends_at <= p_now`), falls in the calendar month of `p_month` **in the business timezone**, and whose status is neither `cancelled` nor `no_show` (so `confirmed` and `completed` both count: owners never tap "completed"). `service_role` only; an unknown business raises `P0002`.
15. `month_report(p_business_id uuid, p_month date, p_now timestamptz default now()) returns jsonb`: `{ completed_jobs, revenue_cents (sum of price_cents over the completed jobs), bookings_created: {whatsapp, nerova, app, web} (created_at in the month, any status), no_shows, cancellations (appointments STARTING in the month), busiest: {weekday 0=Sunday, hour} | null (completed jobs by local start, ties to the earliest), weekly: [{week_start (Monday), completed_jobs}] (every Monday-start week touching the month, zeros included; a job belongs to the week of its local end date) }`. `service_role` only.

pg_cron (guarded migration) calls the API via `pg_net` with header `x-cron-secret`, using settings from Vault (`api_base_url`, `cron_secret`):
`reminders` every 5 min · `conversation-expiry` every 15 min · `waba-health` hourly · `token-refresh` daily 03:00 · `cleanup` daily 03:30.

## 4. API contract (apps/api/, Hono on Supabase Edge Functions)

Base URL: `https://<project-ref>.supabase.co/functions/v1/api` (the paths below are relative to it).

Envelope: success `{ "data": … }`. Error `{ "error": { "code", "message", "details"?, "request_id" } }`.
Headers: `Authorization: Bearer <Clerk session JWT>` on `/v1/**`. `Idempotency-Key: <uuid>` is **required** on every mutating `/v1/**` and `/public/**` call. Every response carries `x-request-id`.
Error codes: `FEATURE_NOT_IN_PLAN 403` (with `details.feature`), `VALIDATION_FAILED 400`, `IDEMPOTENCY_KEY_REQUIRED 400`, `UNAUTHENTICATED 401`, `FORBIDDEN 403` (includes staff hitting owner-only routes), `NO_BUSINESS 403`, `NOT_FOUND 404`, `SLOT_UNAVAILABLE 409`, `WINDOW_CLOSED 409`, `IDEMPOTENCY_KEY_REUSED 422`, `RULE_VIOLATION 422` (with `details.rule`), `RATE_LIMITED 429`, `UPSTREAM_META_ERROR 502`, `COMPANION_NOT_READY 409` (with `details.reason` and optional `details.next_step`), `UPSTREAM_COMPANION_ERROR 502`, `INTERNAL 500`.

DTO shapes live in `packages/types/api.ts`.

**WS-B, booking core**
| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/health` | public | |
| GET | `/v1/me` | member | `{ user, business, role, plan, features }` (`features` = `FeatureEntitlementDTO[]`, see *Plans and entitlements*) |
| POST | `/v1/onboarding` | org owner (no business needed) | `OnboardingRequest` → `MeDTO`. Auth is the verified Clerk token only: active org id from the token, role `org:admin`, else `NO_BUSINESS` 403 / `FORBIDDEN` 403. Upserts the business (`clerkSync.upsertBusiness`), owner user and owner staff row (`ensureMember`), then applies hours, owner staff, team and services (every bookable staff member qualified) atomically through `complete_onboarding`. Idempotent: a business with `onboarded_at` set (or that already has hours, services or extra staff) is returned unchanged, so a failed attempt can simply be retried, a racing double submit cannot duplicate staff or services, and a late Clerk webhook merges instead of duplicating. The `Idempotency-Key` is scoped to the verified org + user (there is no business yet), so another org reusing the same key never sees this response Config rows are audited by the `audit_log` triggers |
| PATCH | `/v1/business` | owner | details + `booking_rules` (partial merge) |
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
| GET | `/v1/team` | owner | `{ members: TeamMemberDTO[], invitations: TeamInvitationDTO[] }`. Members come from the Clerk organisation of the **token's** org (never a client-sent org), enriched with `staff_id` (the staff row whose `user_id` is that login) and `is_self`. Invitations are Clerk's `pending` ones |
| POST | `/v1/team/invitations` | owner | `{ email, role: 'owner'\|'staff', staff_id? }` → `TeamInvitationDTO` (201). Creates a Clerk organisation invitation (`org:admin` / `org:member`) with `public_metadata.staff_id`; if `staff_id` is given and `staff.email` is blank it is set to the invited email. `RULE_VIOLATION` 422 with `details.rule` `ALREADY_MEMBER` (email belongs to a member), `ALREADY_INVITED` (pending invitation for that email) or `STAFF_ALREADY_LINKED` (staff row already has a login); `NOT_FOUND` for an unknown `staff_id`. Idempotent through `Idempotency-Key`. Audited in `audit_log` (`team_invitation`) |
| DELETE | `/v1/team/invitations/:id` | owner | revokes a pending invitation → `{ id, revoked: true }`; `NOT_FOUND` when it is not pending. Audited |
| PATCH | `/v1/team/members/:userId` | owner | `{ role }` → `TeamMemberDTO`. Updates the Clerk membership role and `users.role`. `RULE_VIOLATION` `details.rule = LAST_OWNER` when it would leave the business without an owner; `NOT_FOUND` when the user is not a member. Audited (`team_member`, diff `role {old,new}`) |
| DELETE | `/v1/team/members/:userId` | owner | removes the Clerk membership, clears `users.business_id` and `staff.user_id` for that login → `{ user_id, removed: true }`. The staff row stays (appointments reference it; deactivate it with `PATCH /v1/staff/:id`). `LAST_OWNER` as above. Audited |
| GET | `/public/b/:slug` | public | business + active services + bookable staff |
| GET | `/public/b/:slug/availability/days` · `/slots` | public | same as v1 |
| POST | `/public/b/:slug/attempts` | public | start a web attempt → `{ attempt_id }` |
| POST | `/public/attempts/:id/steps` | public | `{ step }` records step + timestamp |
| POST | `/public/b/:slug/bookings` | public | `{ attempt_id, service_id, staff_id?, starts_at, name, phone, email? }` |
| POST | `/webhooks/clerk` | Svix-signed | org/user/membership mirror |

**Team and login linking.** A business is a Clerk organisation; `org:admin` → `owner`, `org:member` → `staff` (`roleFromClerk`). Calendar people are `staff` rows and may have no login. Team routes go through the `ClerkAdmin` port (`ports.ts`; fetch client `lib/clerkAdmin.ts` against `https://api.clerk.com/v1` with `CLERK_SECRET_KEY`). Without the Clerk webhook, `requireAuth` mirrors the caller on first contact (`booking/memberSync.ts`, re-checked at most every 5 min per instance): `users` row with the role from the verified token, then a staff link, in this order: (1) the staff row named by the invitation's `public_metadata.staff_id` (Clerk copies it onto the membership; must be in the business and unlinked), (2) an unlinked **active** staff row with the same email (case-insensitive), (3) a new staff row named from the Clerk name. The `organizationMembership.created` webhook uses the same `ensureMember` logic. If Clerk is unreachable the user row is still mirrored, no placeholder staff row is created, and the sync retries on the next request. Staff-role members use every member route and none of the owner routes (`requireOwner` → `FORBIDDEN` 403, including all `/v1/team/**`).
| POST | `/cron/cleanup` | cron secret | expire idempotency keys, prune processed webhook events > 30d, abandon stale web attempts |

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
| POST | `/cron/reminders` · `/cron/conversation-expiry` · `/cron/waba-health` · `/cron/token-refresh` | cron secret | |

### Plans and entitlements

Code gates on a **feature key**, never on a plan name. `plan_features` (migration `20261014000001_plan_flags`) is the single source of truth; the API reads it through `business_features()` (`EntitlementService` in `ports.ts`, `createEntitlementService` in `plans/entitlements.ts`) on every gated call, so a plan change applies immediately.

| Feature key | free | starter / growth / pro | What it gates |
| --- | --- | --- | --- |
| `whatsapp_menu` | yes | no | our deterministic WhatsApp engine: `/v1/whatsapp/**`, inbound webhook processing, Flows |
| `inbox` | yes | no | owner Inbox: `/v1/conversations/**`, `/v1/escalations/**` |
| `companion` | no | yes | AI companion powered by Nerova (Nerova also owns their WhatsApp setup) |
| `desktop_app` | no | yes | desktop web app access |
| `extensions` | yes | yes | intake forms, gift cards, loyalty, waitlist, review requests, deposits (deposits also need a payment app, out of scope) |
| `reports` | no | yes | the Reports tab: `GET /v1/reports/summary` |
| `assistant_bookings` | no | yes | monthly assistant-booking cap: `monthly_limit` is **null** (uncapped) until the numbers are decided |

Enforcement:
- `requireFeature(feature)` (`middleware/feature.ts`) runs after `requireAuth` and throws `AppError('FEATURE_NOT_IN_PLAN')` → **403** `{ error: { code: 'FEATURE_NOT_IN_PLAN', details: { feature } } }`. It applies to every `/v1/whatsapp/**` route (status, embedded-signup, connect, sync, pause, resume, disconnect, test-message) with `whatsapp_menu`, and to `/v1/conversations/**` and `/v1/escalations/**` (staff reply, release, resolve) with `inbox`. The check is about the plan, so staff and owners are treated alike.
- `POST /webhooks/whatsapp`: an inbound *message* for an account whose business lacks `whatsapp_menu` is acknowledged (200), recorded in `webhook_events` with note `feature_not_in_plan`, logged, and **not processed**: no client, conversation or message rows and no reply. `POST /flows/whatsapp` answers 427 (flow closed) for such a business. Status, template and account events are unaffected.
- Shared types: `PlanKey`, `FeatureKey`, `FeatureEntitlementDTO`, `EntitlementsDTO` in `packages/types/api.ts`; `MeDTO` gains `plan` and `features` (additive).
- App: `features/plans` exposes `useEntitlements()` (reads `/v1/me`; fails closed while loading or on error) and `<Gate feature="…">`. The app hides UI, the API enforces.
- Not gated on purpose: cron jobs (a business without a WhatsApp account has nothing to send) and notification fan-out, which already skip businesses without a live account. Revisit when Nerova's channel is wired in.

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

Screens from the mockups (§5 of the spec) plus architecture §6: Sign-in · Dashboard (monthly revenue sparkline, today's bookings by status, next appointment + Check-in, today's schedule) · Calendar (Day/Week/Month) · Booking detail (message / reschedule / cancel, status actions) · Add booking (existing/new client, service, date, time from live slots, staff/no preference, notes, WhatsApp confirmation toggle) · Clients (search, All/Recent/VIP filters, paging) · Client profile (message, call, book, contact, notes, history) · Settings (profile, dark mode, push toggle, Business details, Operating hours, Services, Staff management, WhatsApp integration) · Inbox (conversations + escalations, thread, reply, release) · Public web booking comparator `/book/[slug]` (web target, instrumented).

Stack: NativeWind v4 + react-native-reusables components inside the `@booking/ui` design system (`packages/ui`), lucide-react-native icons, `@clerk/clerk-expo` auth, TanStack Query for server state, Supabase JS (`accessToken` from Clerk) for reads and Realtime, and `apps/mobile/src/lib/api.ts` for writes (bearer + Idempotency-Key). Env: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`.

### Plans, usage, companion and reports

Product model: **Free** is the research app (manual + deterministic WhatsApp booking, the team Inbox, no AI companion). The **paid plans** are the Nerova AI companion: Starter R200/month for 50 completed jobs, Growth R400 for 100, Pro R800 for 200. Over the allowance nothing is cut off: each extra completed job costs R4, billed at month end, and usage warns from 80%. Paid plans swap the Inbox for the Companion and the middle tab becomes Reports (`companion` + `reports` features; `inbox` + `whatsapp_menu` are Free only); a quiet manual booking fallback stays. The catalogue (names, prices, allowances) is code (`packages/features/plans/lib/planCatalog.ts`); *which features* a plan unlocks stays in `plan_features`.

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/v1/billing/usage?month=YYYY-MM` | member | `BillingUsageDTO` `{ plan, month, completed_jobs, included_jobs, usage_percent, usage_state, extra_jobs, extra_cost_cents, resets_on }`. `month` defaults to the current month in the business timezone. `usage_state`: `normal` below 80%, `near` from 80% up to and including 100%, `over` above (allowance + 1 jobs). Free: `included_jobs` and `usage_percent` null, state `normal`, no cost. `resets_on` = first day of the next month. Not feature-gated |
| GET | `/v1/plans` | member | `PlansDTO` `{ current_plan, plans: PlanDTO[] }` in catalogue order (free, starter, growth, pro); each `PlanDTO` has `id, name, price_cents, currency, included_jobs, extra_job_cents, has_companion, is_current, checkout_url`. `checkout_url` is always null for now (purchase stays on the web) |
| POST | `/v1/companion/session` | member, feature `companion` | `CreateCompanionSessionRequest` `{ color_mode: 'light' \| 'dark' }` → `CompanionSessionDTO` `{ url, expires_at }` (15-minute Nerova `owner_chat` session: frame the url, mint a new one at expiry). `ownerReference` is the Clerk user id. Free: 403 `FEATURE_NOT_IN_PLAN`. **409 `COMPANION_NOT_READY`** (a state the owner or the Nerova setup can resolve, not a bad request) with `details.reason` `account_not_found` (Nerova has no account for the business) \| `not_provisioned` (account not ready) \| `unavailable` (API key or embed origin not configured), plus `details.next_step` (Nerova's companion setup `nextStep`, e.g. `connect_booking_system`, `provision_account`) when known. Nerova failures: 502 `UPSTREAM_COMPANION_ERROR` |
| GET | `/v1/reports/summary?month=YYYY-MM` | member, feature `reports` | `ReportsSummaryDTO`: our numbers (`completed_jobs`, `revenue_cents`, `bookings_created` by `whatsapp/companion/manual/web`, `no_shows`, `cancellations`, `busiest`, `weekly`), `usage` (same as `/v1/billing/usage`) and `companion` (`CompanionOutcomesDTO` from Nerova, or **null** when Nerova is unavailable or the business has no account: the rest is always served from our data) |

- **Completed job** (the billable unit, `completed_jobs_in_month`): ended by now, in the business-timezone month of its end time, status not `cancelled` and not `no_show`. Counted automatically; no-shows and cancellations never count.
- `manual` in `bookings_created` is the `app` source (walk-in and phone bookings made in the app); `companion` is the `nerova` source.
- **Nerova endpoints used** (client port `NerovaClient` in `packages/companion/nerova`, fetch implementation wired in `container.ts`, fake in `packages/testing/nerova.ts`; bearer `NEROVA_API_KEY`, 8 s timeout): `GET /v1/accounts/{id}` (the id may be the `acct_` id or our business id, which is the connector's account id and so the imported account's `externalReference`; 404 = no account; the `acct_` id is cached in `businesses.nerova_account_id`), `GET /v1/accounts/{id}/companion/setup` (`nextStep`), `POST /v1/accounts/{id}/widgets/sessions` (body `{ widget: 'owner_chat', origin: NEROVA_EMBED_ORIGIN, ownerReference, theme: { colorMode } }`, `Idempotency-Key` `companion-session-{account}-{ownerRef}-{yyyy-mm-ddThh:mm}-{mode}`, hashed when over 128 characters) and `GET /v1/accounts/{id}/outcomes/summary?year=&month=`. Paths, headers and the session body come from Nerova's docs. **Assumed (not seen against a live response):** the exact JSON of the outcome summary; the parser accepts counts for `booking.created`, `booking.rescheduled`, `booking.cancelled` and `conversation.handled` at the top level or under `outcomes`/`counts`/`totals`, as numbers or as objects with `count`/`total`/`value` or a `byActor` split. Nerova's counts are per **UTC** calendar month, ours per business-timezone month.
- The Nerova API key is never logged and never appears in a response. The stored idempotent response of `POST /v1/companion/session` contains the session url (valid 15 minutes).

### Nerova Booking connector (`/connector/nerova/**`)

Lets Nerova's AI companion (Pip) read and act on the bookings of **paid-plan businesses** (feature `companion`). It implements **Nerova Booking MCP v1, contract `2026-10-12`**: MCP over streamable HTTP, served statelessly by the `api` function. Full design: [nerova-connector.md](nerova-connector.md).

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/connector/nerova/mcp` | `Authorization: Bearer <connector token>` (SHA-256 hash in `NEROVA_CONNECTOR_TOKEN_HASHES`) | JSON-RPC: `initialize`, `notifications/*`, `ping`, `tools/list`, `tools/call` |

- Not under `/v1`: no Clerk, no CORS, no `Idempotency-Key` header. Browser `Origin` requests get 403; other methods 405. A missing, wrong or unconfigured token is HTTP **401** (`application/problem+json`, `code: unauthorized`).
- Tools (published verbatim from `packages/companion/connector/booking-connector.mcp-tools.json`, read-only annotations on the seven read tools): `accounts_list`, `accounts_get`, `services_list`, `staff_list`, `availability_search`, `appointments_get`, `appointments_list`, `appointments_create`, `appointments_reschedule`, `appointments_cancel`.
- **Account = business** (`accountId` = `businesses.id`, also its single location). Only businesses with `companion` are listed or readable: Free, unknown and malformed ids are `not_found`. Entitlements are read live on every call.
- Results are `structuredContent` (+ the same JSON as a `text` item). Failures are tool results with `isError: true` and `structuredContent.code` ∈ `invalid_request | unauthorized | not_found | conflict | rate_limited | provider_unavailable`. Mapping: `VALIDATION_FAILED→invalid_request`, `NOT_FOUND/NO_BUSINESS→not_found`, `SLOT_UNAVAILABLE/RULE_VIOLATION/IDEMPOTENCY_KEY_REUSED→conflict`, everything unexpected → `provider_unavailable` (no internals leaked).
- Writes go through `BookingService` (`source: 'nerova'`, actor `{ type: 'nerova', id: 'nerova' | 'nerova:<conversationId>' }`, `notifyCustomer: false`), so the exclusion constraint, `appointment_events` and the idempotent `create_appointment` apply. The idempotency key is `nerova:<accountId>:<idempotencyKey>`; a replay returns the first appointment. When Nerova's `origin.channel` is present (a customer-facing conversation) reschedule/cancel are held to `cancellation_window_minutes` (`enforceCancellationWindow`).
- Ports: `BookingService.listAppointments(AppointmentWindowQuery)`, `EntitlementService.listBusinessIdsWithFeature`, `AccountEventsPort.accountChanged`; `CancelAppointmentInput`/`RescheduleAppointmentInput` gain `enforceCancellationWindow`; `Container` gains `nerovaEvents` and `clock`.
- Signed account events (Standard Webhooks) to Nerova's `events.url` on business/hours changes; **off by default** (`NEROVA_EVENTS_ENABLED`).

## 7. Backend environment

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (injected by Supabase), `API_BASE_URL`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY` (PEM, networkless verify), `CLERK_AUTHORIZED_PARTIES` (csv), `CLERK_WEBHOOK_SECRET`, `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION` (default `v23.0`), `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_FLOW_PRIVATE_KEY` (PEM), `WHATSAPP_FLOW_PRIVATE_KEY_PASSPHRASE`, `WHATSAPP_REGISTRATION_PIN`, `TOKEN_ENCRYPTION_KEY` (32-byte base64, AES-256-GCM for Meta tokens), `FLOW_TOKEN_SECRET`, `CRON_SECRET`, `PUBLIC_WEB_BOOKING_URL`, `EXPO_ACCESS_TOKEN` (optional, push), `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` (optional, reserved for planned subscriptions), `NEROVA_CONNECTOR_TOKEN_HASHES` (csv of SHA-256 hex hashes of accepted connector bearer tokens; empty = connector off), `NEROVA_EVENTS_ENABLED` / `NEROVA_EVENTS_URL` / `NEROVA_EVENTS_SIGNING_SECRET` (optional signed account events, off by default), `NEROVA_API_KEY` (optional, Nerova REST: companion sessions and outcome counts) and `NEROVA_EMBED_ORIGIN` (origin on Nerova's embed allowlist). Environments and secret handling: `docs/environments.md`.

## 8. Workstreams and sequencing

1. **Scaffold** (done first): this plan, `packages/types/api.ts`, backend skeleton (Hono app, env, db client, errors, logger with PII redaction, request-id, Clerk auth, idempotency middleware, ports + stubs, route mount points, Vitest).
2. **In parallel:** WS-A (DB), WS-B (booking core API), WS-C (WhatsApp engine), WS-D (app). Each works in its own folders, writes tests, and commits on its own branch.
3. **Integration:** merge, swap in the real `Database` types, reconcile RPC and column names, run typecheck, tests, SQL tests and lint, set up CI, update the README, open the PR.

Definition of done per workstream: typecheck clean, tests passing, no TODO stubs left in owned folders, and a short `docs/<workstream>.md` covering setup and any deviations from this plan.
