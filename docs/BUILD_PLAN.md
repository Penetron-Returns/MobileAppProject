# Build Plan: WhatsApp Booking Platform

Source spec: *ITMDA3 Deliverable 3, Group S14*. This file pins the contracts that every workstream builds against. If code and this file disagree, fix one of them in the same PR. Don't let them drift.

## 1. Architecture (from the spec, §6)

| Tier | Tech | Role |
| --- | --- | --- |
| Client | Expo (React Native), Expo Router, NativeWind + react-native-reusables (shadcn for RN) | Owner/staff app. Reads through Supabase (RLS) and writes through the API |
| API | Supabase Edge Functions (Deno, TypeScript, Hono): one function `api`, code in `apps/backend/` | All writes, booking rules, availability, WhatsApp engine. The only holder of Meta tokens |
| Data | Supabase Postgres + RLS + Realtime + Storage + pg_cron | Single source of truth |
| Identity | Clerk (orgs = businesses, roles owner/staff) | JWTs trusted by Supabase (third-party auth) and verified by the API |
| Channel | Meta WhatsApp Cloud API + WhatsApp Flows | Customer surface. Deterministic, with no AI and no free-text parsing |

Rules that are never broken:
1. **Deterministic.** Every inbound WhatsApp event maps to `(state, input id) → (next state, actions)`. Anything else is rejected with a fixed message. We never interpret free text.
2. **All writes go through the API.** The app gets `SELECT` only (RLS). The API uses the service-role key.
3. **Double booking is impossible at the data layer.** A `btree_gist` exclusion constraint on `(staff_id, blocked)` for non-cancelled appointments.
4. **Idempotent mutations.** Every mutating API call needs an `Idempotency-Key` header, stored in `idempotency_keys`, and a replay returns the stored response.
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
apps/backend/                API source: runtime-agnostic Hono app (own package.json, Vitest)
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
packages/shared/             TYPES ONLY (no runtime imports), used by app + backend
  api.ts                     DTOs + request/response contracts
  database.types.ts          generated Supabase `Database` type                   → WS-A
supabase/                    config.toml, migrations, seed, SQL tests (root: Supabase CLI convention) → WS-A
  functions/api/             Edge Function entry (Deno) serving apps/backend/src/app.ts under /api
docs/                        this plan + per-workstream docs
```

Time conventions: the API speaks ISO-8601 with an offset for instants (`2026-09-30T09:00:00.000Z`) and `YYYY-MM-DD` for calendar dates **in the business timezone**. Weekday is `0 = Sunday … 6 = Saturday` (same as JS `getDay()` and Postgres `extract(dow)`). Money is integer cents in `businesses.currency` (default `ZAR`). Default timezone is `Africa/Johannesburg`.

## 3. Database schema (WS-A implements, everyone codes against it)

Extensions: `pgcrypto`, `btree_gist`, `citext`, plus `pg_cron` and `pg_net` only in a separate migration guarded so local Postgres without them still migrates.

Schemas: tables live in `public`. Helpers (`current_business_id()`, audit trigger fn) live in `private`. Write RPCs live in `public`, with `EXECUTE` revoked from `anon` and `authenticated` and granted to `service_role` only, unless noted.

### Enums
- `member_role`: `owner | staff`
- `appointment_status`: `confirmed | cancelled | completed | no_show`
- `appointment_source`: `whatsapp | app | web`
- `appointment_event_type`: `created | rescheduled | cancelled | completed | no_show | checked_in | reminder_sent | confirmation_sent | notes_updated`
- `actor_type`: `customer | staff | system`
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
| `businesses` | `clerk_org_id text unique not null`, `name text not null`, `slug citext unique not null`, `timezone text not null default 'Africa/Johannesburg'`, `currency char(3) not null default 'ZAR'`, `logo_url text`, `address text`, `phone text`, `email text`, `booking_rules jsonb not null default <below>`, `plan plan_key not null default 'free'` | no business_id. `plan` is written only by the service role (future billing webhook); the app has SELECT only and no API route changes it |
| `plan_features` | pk(`plan`, `feature`), `plan plan_key`, `feature text` (snake_case), `monthly_limit int null` (>= 0; null = no cap) | global catalogue, no business_id. RLS on, SELECT for `authenticated`, writes service role only. See *Plans and entitlements* below |
| `users` | `id text pk` (Clerk user id), `business_id uuid null`, `role member_role not null default 'staff'`, `email text`, `display_name text`, `avatar_url text` | mirrored from Clerk |
| `staff` | `user_id text null references users`, `name text not null`, `title text`, `photo_url text`, `phone text`, `email text`, `color text`, `is_active bool not null default true`, `accepts_bookings bool not null default true`, `sort_order int not null default 0` | a staff member may have no login |
| `services` | `name text not null`, `description text`, `category text`, `duration_minutes int not null check (>0 and <= 720)`, `price_cents int not null default 0 check (>=0)`, `deposit_cents int not null default 0`, `is_active bool not null default true`, `sort_order int not null default 0` | |
| `staff_services` | pk(`staff_id`,`service_id`), `business_id` | who can perform what |
| `business_hours` | `weekday smallint 0..6`, `opens_at time`, `closes_at time` check closes>opens | several rows a day = split shifts (lunch). No rows = closed |
| `availability_rules` | `staff_id uuid not null`, `weekday smallint`, `start_time time`, `end_time time` check end>start | staff working hours. **A staff member with zero rules inherits business_hours** |
| `availability_overrides` | `staff_id uuid null` (null = whole business), `date date not null`, `start_time time null`, `end_time time null`, `is_closed bool not null default false`, `reason text` | if `is_closed`: no availability that date. Otherwise the override window **replaces** the weekday rules for that date |
| `clients` | `phone_e164 text not null check ~ '^\+[1-9][0-9]{6,14}$'`, `name text`, `email text`, `notes text`, `tags text[] not null default '{}'`, `is_blocked bool not null default false`, `whatsapp_opt_in bool not null default true`, `first_seen_at timestamptz not null default now()`, `last_seen_at timestamptz` | unique(`business_id`,`phone_e164`) |
| `client_notes` | `client_id uuid not null`, `body text not null`, `kind text not null default 'general' check in ('general','warning','preference')`, `created_by text` | "Important notes" in the mockup |
| `appointments` | `client_id`, `staff_id`, `service_id` (FKs, not null), `slot tstzrange not null` (`[)`), `blocked tstzrange not null` (slot + business buffer, set by RPC), `status appointment_status not null default 'confirmed'`, `source appointment_source not null`, `price_cents int not null`, `duration_minutes int not null`, `notes text`, `idempotency_key text unique`, `checked_in_at timestamptz`, `cancelled_at timestamptz`, `cancel_reason text`, `created_by text` | **`EXCLUDE USING gist (staff_id WITH =, blocked WITH &&) WHERE (status <> 'cancelled')`**. Index on (business_id, lower(slot)) |
| `appointment_events` | `appointment_id uuid not null`, `type appointment_event_type`, `actor actor_type`, `actor_id text`, `payload jsonb not null default '{}'`, `occurred_at timestamptz not null default now()` | unique index on `(appointment_id, (payload->>'offset_minutes'))` where `type='reminder_sent'` |
| `audit_log` | `id bigint identity pk`, `business_id uuid null`, `actor actor_type`, `actor_id text`, `action text` (insert/update/delete), `entity text`, `entity_id text`, `diff jsonb`, `request_id text`, `occurred_at timestamptz default now()` | written by trigger on businesses, services, staff, staff_services, business_hours, availability_rules, availability_overrides, clients. The actor comes from `current_setting('app.actor_id', true)` / `app.request_id` |
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
9. `replace_business_hours(p_business_id uuid, p_rows jsonb)` and `replace_staff_availability(p_staff_id uuid, p_rows jsonb)` and `replace_staff_services(p_staff_id uuid, p_service_ids uuid[])`. Each is an atomic full-replace.
10. `set_request_context(p_actor_id text, p_request_id text)` sets the `app.*` GUCs for the audit trigger (the API calls it inside RPCs where it matters; triggers fall back to `system`).
11. `business_features(p_business_id uuid default null) returns table(plan plan_key, feature text, monthly_limit int)`. The plan and feature rows for one business (null = the caller's business from the JWT org). **SECURITY INVOKER**: `authenticated` only ever sees its own business through RLS, and `service_role` can ask for any. **Callable by `authenticated`**, like `dashboard_summary`.

pg_cron (guarded migration) calls the API via `pg_net` with header `x-cron-secret`, using settings from Vault (`api_base_url`, `cron_secret`):
`reminders` every 5 min · `conversation-expiry` every 15 min · `waba-health` hourly · `token-refresh` daily 03:00 · `cleanup` daily 03:30.

## 4. API contract (apps/backend/, Hono on Supabase Edge Functions)

Base URL: `https://<project-ref>.supabase.co/functions/v1/api` (the paths below are relative to it).

Envelope: success `{ "data": … }`. Error `{ "error": { "code", "message", "details"?, "request_id" } }`.
Headers: `Authorization: Bearer <Clerk session JWT>` on `/v1/**`. `Idempotency-Key: <uuid>` is **required** on every mutating `/v1/**` and `/public/**` call. Every response carries `x-request-id`.
Error codes: `FEATURE_NOT_IN_PLAN 403` (with `details.feature`), `VALIDATION_FAILED 400`, `IDEMPOTENCY_KEY_REQUIRED 400`, `UNAUTHENTICATED 401`, `FORBIDDEN 403` (includes staff hitting owner-only routes), `NO_BUSINESS 403`, `NOT_FOUND 404`, `SLOT_UNAVAILABLE 409`, `WINDOW_CLOSED 409`, `IDEMPOTENCY_KEY_REUSED 422`, `RULE_VIOLATION 422` (with `details.rule`), `RATE_LIMITED 429`, `UPSTREAM_META_ERROR 502`, `INTERNAL 500`.

DTO shapes live in `packages/shared/api.ts`.

**WS-B, booking core**
| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/health` | public | |
| GET | `/v1/me` | member | `{ user, business, role, plan, features }` (`features` = `FeatureEntitlementDTO[]`, see *Plans and entitlements*) |
| POST | `/v1/onboarding` | org owner (no business needed) | `OnboardingRequest` → `MeDTO`. Auth is the verified Clerk token only: active org id from the token, role `org:admin`, else `NO_BUSINESS` 403 / `FORBIDDEN` 403. Upserts the business (`clerkSync.upsertBusiness`), owner user and owner staff row (`ensureMember`), then applies hours, services (every bookable staff member qualified) and team. Idempotent: a business that already has hours, services or extra staff is returned unchanged, so a late Clerk webhook (or a retry with a new key) merges instead of duplicating. Config rows are audited by the `audit_log` triggers |
| PATCH | `/v1/business` | owner | details + `booking_rules` (partial merge) |
| PUT | `/v1/business/hours` | owner | full week replace `{ hours: BusinessHoursRow[] }` |
| POST/PATCH/DELETE | `/v1/services[/:id]` | owner | DELETE = soft (is_active=false) if referenced |
| POST/PATCH/DELETE | `/v1/staff[/:id]` | owner | |
| PUT | `/v1/staff/:id/services` | owner | `{ service_ids }` |
| PUT | `/v1/staff/:id/availability` | owner | `{ rules: AvailabilityRuleInput[] }` |
| POST | `/v1/overrides` | owner | `{ staff_id?, date, is_closed, start_time?, end_time?, reason? }` |
| DELETE | `/v1/overrides/:id` | owner | |
| POST/PATCH | `/v1/clients[/:id]` | member | phone normalised to E.164 (default region ZA) |
| POST/DELETE | `/v1/clients/:id/notes[/:noteId]` | member | |
| GET | `/v1/availability/days?service_id&from&to[&staff_id]` | member | `{ days: string[] }` |
| GET | `/v1/availability/slots?service_id&date[&staff_id]` | member | `{ slots: SlotDTO[] }` |
| POST | `/v1/appointments` | member | `CreateAppointmentRequest`. `allow_outside_hours` lets staff book walk-ins outside hours (overlap still enforced) |
| POST | `/v1/appointments/:id/reschedule` | member | `{ starts_at, staff_id?, notify_customer? }` |
| POST | `/v1/appointments/:id/cancel` | member | `{ reason?, notify_customer? }` |
| POST | `/v1/appointments/:id/status` | member | `{ status: 'completed' \| 'no_show' }` |
| POST | `/v1/appointments/:id/check-in` | member | |
| PATCH | `/v1/appointments/:id` | member | `{ notes }` |
| POST | `/v1/devices` | member | `{ token, platform }` |
| GET | `/public/b/:slug` | public | business + active services + bookable staff |
| GET | `/public/b/:slug/availability/days` · `/slots` | public | same as v1 |
| POST | `/public/b/:slug/attempts` | public | start a web attempt → `{ attempt_id }` |
| POST | `/public/attempts/:id/steps` | public | `{ step }` records step + timestamp |
| POST | `/public/b/:slug/bookings` | public | `{ attempt_id, service_id, staff_id?, starts_at, name, phone, email? }` |
| POST | `/webhooks/clerk` | Svix-signed | org/user/membership mirror |
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
| `assistant_bookings` | no | yes | monthly assistant-booking cap: `monthly_limit` is **null** (uncapped) until the numbers are decided |

Enforcement:
- `requireFeature(feature)` (`middleware/feature.ts`) runs after `requireAuth` and throws `AppError('FEATURE_NOT_IN_PLAN')` → **403** `{ error: { code: 'FEATURE_NOT_IN_PLAN', details: { feature } } }`. It applies to every `/v1/whatsapp/**` route (status, embedded-signup, connect, sync, pause, resume, disconnect, test-message) with `whatsapp_menu`, and to `/v1/conversations/**` and `/v1/escalations/**` (staff reply, release, resolve) with `inbox`. The check is about the plan, so staff and owners are treated alike.
- `POST /webhooks/whatsapp`: an inbound *message* for an account whose business lacks `whatsapp_menu` is acknowledged (200), recorded in `webhook_events` with note `feature_not_in_plan`, logged, and **not processed**: no client, conversation or message rows and no reply. `POST /flows/whatsapp` answers 427 (flow closed) for such a business. Status, template and account events are unaffected.
- Shared types: `PlanKey`, `FeatureKey`, `FeatureEntitlementDTO`, `EntitlementsDTO` in `packages/shared/api.ts`; `MeDTO` gains `plan` and `features` (additive).
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

## 7. Backend environment

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (injected by Supabase), `API_BASE_URL`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY` (PEM, networkless verify), `CLERK_AUTHORIZED_PARTIES` (csv), `CLERK_WEBHOOK_SECRET`, `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION` (default `v23.0`), `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_FLOW_PRIVATE_KEY` (PEM), `WHATSAPP_FLOW_PRIVATE_KEY_PASSPHRASE`, `WHATSAPP_REGISTRATION_PIN`, `TOKEN_ENCRYPTION_KEY` (32-byte base64, AES-256-GCM for Meta tokens), `FLOW_TOKEN_SECRET`, `CRON_SECRET`, `PUBLIC_WEB_BOOKING_URL`, `EXPO_ACCESS_TOKEN` (optional, push), `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` (optional, reserved for planned subscriptions). Environments and secret handling: `docs/environments.md`.

## 8. Workstreams and sequencing

1. **Scaffold** (done first): this plan, `packages/shared/api.ts`, backend skeleton (Hono app, env, db client, errors, logger with PII redaction, request-id, Clerk auth, idempotency middleware, ports + stubs, route mount points, Vitest).
2. **In parallel:** WS-A (DB), WS-B (booking core API), WS-C (WhatsApp engine), WS-D (app). Each works in its own folders, writes tests, and commits on its own branch.
3. **Integration:** merge, swap in the real `Database` types, reconcile RPC and column names, run typecheck, tests, SQL tests and lint, set up CI, update the README, open the PR.

Definition of done per workstream: typecheck clean, tests passing, no TODO stubs left in owned folders, and a short `docs/<workstream>.md` covering setup and any deviations from this plan.
