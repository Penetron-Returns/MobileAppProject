# Booking core (WS-B)

This workstream covers the availability engine, the BookingService (`src/ports.ts`), the `/v1` admin REST API, the public web-booking comparator, the Clerk webhook and the cleanup job. Everything lives in `backend/`.

```
src/booking/
  availability.ts      pure engine (no I/O, injected `now`)
  service.ts           BookingService over a repository
  repository.ts        BookingRepository interface + Supabase implementation
  memoryRepository.ts  in-memory fake with RPC semantics (for our tests and WS-C's)
  rows.ts, mappers.ts  explicit row types, row → DTO mapping
  admin.ts             owner/staff CRUD used by /v1
  attempts.ts          booking_attempts instrumentation (web channel)
  clerkSync.ts         Clerk org/user/membership mirror
  rateLimit.ts         best-effort per-IP limiter for /public POSTs
  jobs.ts              runCleanupJob
  index.ts             createBookingService, getBookingRepository
src/routes/v1/**       /v1 routes + zod v4 schemas
src/routes/public.ts   /public comparator
src/routes/clerk.ts    /webhooks/clerk
src/lib/time.ts        tstzrange + timestamptz parsing, wall-clock helpers (luxon)
src/lib/phone.ts       E.164 normalisation (libphonenumber-js, default region ZA)
test/booking/**        tests
```

## Setup

To install and check the backend: `cd backend && npm ci && npx tsc --noEmit && npx vitest run`. No new dependencies were added. The code uses hono, @supabase/supabase-js, svix, zod v4, luxon and libphonenumber-js. The only environment variable it adds to the scaffold's set is `CLERK_WEBHOOK_SECRET`, which the Clerk webhook requires.

## Availability algorithm

The inputs to `computeSlots(input, date)` are:

- the business timezone and booking rules
- business hours
- per-staff rules
- overrides
- busy ranges, which are the `blocked` ranges of non-cancelled appointments
- the service duration
- the candidate staff (active, `accepts_bookings`, qualified)
- `now`

For one calendar date `D` in the business timezone:

1. **Bookable dates** run from `today` to `today + booking_horizon_days` inclusive, where `today` is the date of `now` in the business timezone. Any other date returns `[]`.
2. **Business windows(D)**: if any business-wide override (`staff_id null`) exists for `D`, it decides. `is_closed` gives `[]`, and otherwise the override windows *replace* the business hours. Without an override, the business windows are the `business_hours` rows for `weekday(D)`, where 0 is Sunday.
3. **Staff windows(D)**: a per-staff override decides in the same way (closed or replacement windows). Without one, the staff member's `availability_rules` for `weekday(D)` apply, and a staff member with **zero rules** inherits the business windows.
4. **Effective windows** are staff windows ∩ business windows. Overlapping or touching rows are merged first, so 09:00–10:30 plus 10:30–12:00 behaves as one 09:00–12:00 window.
5. Each effective window's wall-clock bounds are converted to instants with luxon (see DST below). Candidate starts are `t = windowStart, windowStart + interval, …` for as long as `t + duration ≤ windowEnd`. The service must fit inside the window, but the buffer does not have to.
6. A candidate is kept when `t ≥ now + lead_time_minutes` and `[t, t + duration + buffer)` does not overlap any busy range of that staff member. Ranges are half-open, which matches the DB exclusion constraint on `blocked`.
7. Slots are merged across staff by start instant and sorted by start. `staff_ids` is ordered by the deterministic tie-break: fewest appointments that day (counted by appointment start date in the business timezone), then `sort_order`, then `id`.

`listAvailableDays(input, from, to)` clips `[from, to]` to the bookable range and keeps the dates that have at least one slot. `findSlot` returns the slot that starts exactly at a given instant, so a start that isn't on the slot grid is rejected. `freeStaffIgnoringHours` serves staff walk-ins.

**DST.** A window boundary is converted from wall clock to an instant for each date. A boundary that falls inside a spring-forward gap resolves forward (01:30 becomes 02:30 BST). An ambiguous fall-back time resolves to its first occurrence, which is luxon's behaviour. Slot starts step in **elapsed** time from the window start, so a DST day never produces duplicate or non-existent instants: a window spanning the gap is one hour shorter and one spanning the fall-back is one hour longer. The tests cover Europe/London on both transition days.

## BookingService behaviour

- `createAppointment`
  1. Replays by idempotency key first. If the key already has an appointment it is returned as-is, with no re-validation and no second notification.
  2. Checks that the service is active.
  3. Re-validates the start against **live** availability for the date (lead time, horizon, grid alignment, overlap) and resolves the staff member. A requested staff member must be free. With no preference, the first entry of the slot's `staff_ids` wins.
  4. Calls the `create_appointment` RPC. Its errors are mapped by `mapDbError`, so a lost race becomes 23P01, which is returned as `SLOT_UNAVAILABLE`.
- `allowOutsideHours` only has effect for `actor.type === 'staff'`. It skips hours, lead time and the grid, but staff are still picked by the overlap and tie-break rules, and the DB exclusion constraint remains the final guard.
- `rescheduleAppointment` and `cancelAppointment`:
  - A customer only sees their own appointments (anything else returns `NOT_FOUND`) and must act at least `cancellation_window_minutes` before the start, or the call fails with `RULE_VIOLATION` and `rule=CANCELLATION_WINDOW`.
  - A reschedule revalidates the new start with the appointment's own busy range excluded.
  - When no staff member is requested, a reschedule keeps the current staff member if they are free at the new time, and otherwise falls back to the tie-break.
- After every successful create, reschedule or cancel, the service calls `notifications.appointmentChanged`. Failures are caught and logged (the logger redacts PII) and never fail the booking. `notifyCustomer` defaults to `false` inside the service, and the routes set it explicitly.

## Audit context

`set_request_context` sets transaction-local GUCs, and each PostgREST request is its own transaction, so calling it from the API has no effect on the next request. Instead, the actor is passed **into every lifecycle RPC** (`p_actor`, `p_actor_id`; `created_by` is set by the RPC). The actor id is the Clerk user id for staff and the client id for customers. Direct table writes (catalog, clients, notes, overrides) go through PostgREST with the service role, so the audit trigger records them as `system`. If per-user attribution of configuration changes is needed, WS-A can expose thin RPCs that call `set_request_context` internally.

## Public comparator

- The comparator uses the same `BookingService` (engine and RPCs) as the app and WhatsApp channels.
- The business is resolved by slug. The endpoint exposes active services, bookable staff (`id, name, title, photo_url` only) and the service → staff map. It never exposes phone numbers, emails or org ids.
- An inactive or unknown service returns 404.
- When `allow_staff_selection` is false, the staff list and the service → staff map are empty and any `staff_id` sent in is ignored (treated as no preference).
- A booking calls `upsert_client_by_phone` and then fills only blank fields (`name`, `email`). An unauthenticated form never overwrites existing client data.
- The appointment is created with `source='web'`, the actor `{customer, client_id}`, the RPC idempotency key `web:<Idempotency-Key>` and `notifyCustomer: true`.
- `booking_attempts` for channel `web`:
  - Start inserts a row with `session_key = web:<Idempotency-Key>`.
  - Each step appends `{step, at}` and increments `step_count`. Step ids must match `^[a-z0-9][a-z0-9_:.-]{0,63}$` (no free text), with at most 200 per attempt.
  - Success sets `outcome='completed'`, `completed_at`, `appointment_id` and `client_id`.
  - A failed booking sets `outcome='failed'` and `error_code` (the rule code for rule violations, otherwise the API error code). A failed attempt stays open so the customer can retry, while `completed` and `abandoned` are final (`ATTEMPT_CLOSED`).
- **Rate limit**: 60 POSTs per minute per client IP (first `x-forwarded-for` hop, set by the Supabase Edge gateway), fixed window, in memory for each warm instance. This is best effort: it resets on cold start and isn't shared across instances, and it is the only hidden state in the booking core. IPs are never logged.

## Clerk webhook

- The webhook verifies every request with `svix` using `CLERK_WEBHOOK_SECRET` and returns 400 when verification fails.
- It deduplicates through `webhook_events` (`source='clerk'`, `event_key` = svix-id). An event that has already been processed returns 200 `{status:'duplicate'}`. An unprocessed duplicate from an earlier failure is processed again, and `attempts` is incremented.
- It stores only `{type, object_id}` as the payload, because Clerk payloads carry PII.
- Handled and ignored event types return 200. A processing failure records `error` (the code only) and returns 500, so Svix retries.
- Organisations are upserted on `clerk_org_id`. The slug comes from the org slug, or from the slugified name when there is none, and is made unique as `base`, `base-2`, `base-3`, and so on. An update that has no org slug keeps the current one. `organization.deleted` detaches the business's users and then deletes the business, cascading to everything it owns.
- `user.created` and `user.updated` upsert the user's email (primary address), display name and avatar. `user.deleted` unlinks `staff.user_id` and then deletes the user.
- `organizationMembership.created` and `.updated` upsert the business (memberships can arrive before `organization.created`) and set `users.business_id` and `role` (`org:admin` → owner, anything else → staff). On `created`, a `staff` row linked to the user is also inserted if none exists. `.deleted` clears the user's `business_id` and unlinks the staff row without deactivating it, so the owner decides what happens to their bookings.

## Cleanup job

`runCleanupJob(container, now)` has three steps:

1. Delete `idempotency_keys` with `expires_at < now`.
2. Delete `webhook_events` with `processed_at < now - 30d`. Unprocessed events are kept.
3. Set web `booking_attempts` that are still `in_progress` with `started_at < now - 2h` to `abandoned`.

The steps run independently. It returns `{ idempotency_keys_deleted, webhook_events_pruned, attempts_abandoned, failed_steps }`.

## Database dependencies (cross-check against WS-A)

| Table | Columns used |
| --- | --- |
| `businesses` | id, clerk_org_id, name, slug, timezone, currency, logo_url, address, phone, email, booking_rules |
| `users` | id, business_id, role, email, display_name, avatar_url (upsert on `id`) |
| `staff` | id, business_id, user_id, name, title, photo_url, phone, email, color, is_active, accepts_bookings, sort_order |
| `services` | id, business_id, name, description, category, duration_minutes, price_cents, deposit_cents, is_active, sort_order |
| `staff_services` | business_id, staff_id, service_id (upsert `onConflict: staff_id,service_id`) |
| `business_hours` | business_id, weekday, opens_at, closes_at |
| `availability_rules` | business_id, staff_id, weekday, start_time, end_time |
| `availability_overrides` | id, business_id, staff_id, date, start_time, end_time, is_closed, reason |
| `clients` | id, business_id, phone_e164, name, email, notes, tags, is_blocked, whatsapp_opt_in, first_seen_at, last_seen_at |
| `client_notes` | id, business_id, client_id, body, kind, created_by, created_at |
| `appointments` | id, business_id, client_id, staff_id, service_id, slot, blocked, status, source, price_cents, duration_minutes, notes, idempotency_key, checked_in_at, cancelled_at, cancel_reason, created_by, created_at |
| `booking_attempts` | id, business_id, channel, client_id, conversation_id, session_key, started_at, completed_at, step_count, outcome, appointment_id, error_code, steps |
| `webhook_events` | id, source, event_key, payload, received_at, processed_at, error, attempts (unique `source, event_key`) |
| `idempotency_keys` | expires_at |
| `device_push_tokens` | business_id, user_id, token (unique, upsert on `token`), platform |

PostgREST filters used:

- `blocked=ov.[from,to)` for busy ranges
- `slot=sr.[now,now]` for "starts after now"
- `.order('slot')`

RPCs, with the exact parameter names:

- `create_appointment(p_business_id, p_client_id, p_staff_id, p_service_id, p_starts_at, p_source, p_idempotency_key, p_actor, p_actor_id, p_notes)`
- `reschedule_appointment(p_appointment_id, p_starts_at, p_staff_id, p_actor, p_actor_id)`
- `cancel_appointment(p_appointment_id, p_actor, p_actor_id, p_reason)`
- `set_appointment_status(p_appointment_id, p_status, p_actor, p_actor_id)`
- `check_in_appointment(p_appointment_id, p_actor_id)`
- `upsert_client_by_phone(p_business_id, p_phone_e164, p_name)`
- `replace_business_hours(p_business_id, p_rows)`, where `p_rows` is `[{weekday, opens_at, closes_at}]`
- `replace_staff_availability(p_staff_id, p_rows)`, where `p_rows` is `[{weekday, start_time, end_time}]`
- `replace_staff_services(p_staff_id, p_service_ids)`

The RPCs that return `appointments` or `clients` may return an object or a one-element array, and both are handled. The code also assumes that `create_appointment` checks the client, staff and service belong to `p_business_id`, which the API checks beforehand as well.

**Business scoping.** Every query is filtered by `business_id`, except in these documented cases:

- identity lookups that happen before a business is known: `businesses` by slug or `clerk_org_id`, and `users` by id
- the public attempt lookup by id (the attempt id is the capability)
- `webhook_events`
- the global cleanup job
- RPCs that take no business id, which are only called after an ownership check in the same request

Delete ordering doesn't rely on FK cascade rules the plan leaves unspecified:

- `staff_services`, rules and overrides are deleted before their staff row.
- `users.business_id` is cleared before a business is deleted.
- `staff.user_id` is cleared before a user is deleted.

## Deviations from BUILD_PLAN

1. **Container extension (additive, WS-B files only).** `getBookingRepository(container)` uses `container.bookingRepository` when it is present, and otherwise a Supabase repository over `container.db` (cached per client). Tests attach the in-memory fake this way. The integrator may add `bookingRepository?: BookingRepository` to `Container`.
2. **Response shapes that the plan leaves unspecified** (candidates to add to `shared/api.ts`):
   - `PUT /v1/business/hours` returns `{ hours: BusinessHoursRow[] }`.
   - `PUT /v1/staff/:id/services` returns `{ staff_id, service_ids }`.
   - `PUT /v1/staff/:id/availability` returns `{ staff_id, rules }`.
   - `POST /v1/overrides` returns `OverrideDTO` (`booking/admin.ts`).
   - `DELETE /v1/services/:id` and `DELETE /v1/staff/:id` return `{ id, deleted }`, where `deleted:false` means the row was deactivated.
   - `DELETE /v1/overrides/:id` and `DELETE /v1/clients/:id/notes/:noteId` return `{ id }`.
   - `POST /v1/devices` returns `{ token, platform }`.
   - `POST /public/attempts/:id/steps` returns `{ attempt_id, step_count }`.
   - Creates return 201.
3. **Lenient create bodies.** The create schemas accept `description`, `category`, `deposit_cents`, `sort_order`, `title` and similar fields as optional, with defaults of null or 0, even though the TS request types mark them as required. Stricter clients remain valid.
4. **`POST /v1/clients` is an upsert by phone** (through `upsert_client_by_phone`, then the provided fields are applied). It returns the existing client when the phone is already known, and always responds 201.
5. **Soft delete for staff**: a staff member referenced by appointments is deactivated (`is_active=false, accepts_bookings=false`) rather than deleted, mirroring the rule for services.
6. **Horizon**: the bookable dates are `today … today + booking_horizon_days` inclusive, in the business timezone.
7. **A staff override never extends past business hours.** It is intersected with the business windows, so opening a normally closed day needs a business-wide override.
8. **Reschedule with no `staff_id`** keeps the current staff member when they are free, and otherwise uses the tie-break winner.
9. **`SLOT_UNAVAILABLE`** also covers starts that are off the slot grid, outside hours, before now + lead time or beyond the horizon. The live re-check can't tell a taken slot from one that was never valid.
10. **Notifications**: `notifyCustomer` defaults to `false` inside the service. The `/v1` routes default `send_whatsapp_confirmation` and `notify_customer` to `true`, and public web bookings always pass `true`.
11. **Idempotency keys for the RPC** are namespaced: `app:<key>` for `/v1`, `web:<key>` for `/public`. WS-C should use a prefix of its own, for example `wa:`.
12. **Audit actor**: see "Audit context". Direct table writes are attributed to `system`.
13. **`GET /v1/me` `role`** comes from the verified session token, not from `users.role`, because the users table is a webhook mirror that may lag. `user` falls back to nulls when the mirror row doesn't exist yet.
14. **Cleanup job** also returns `failed_steps`. Attempts are aged by `started_at`.
