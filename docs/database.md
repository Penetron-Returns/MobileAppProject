# Database (WS-A)

Supabase Postgres schema for the booking platform: the tables, RLS, RPCs, realtime, storage and cron described in `docs/BUILD_PLAN.md` §3.

| Path | What |
| --- | --- |
| `supabase/migrations/20260924000001_extensions_schemas_enums.sql` | `extensions` / `private` schemas, `pgcrypto`, `btree_gist`, `citext`, all enums |
| `supabase/migrations/20260924000002_tables.sql` | every table, check, FK and index |
| `supabase/migrations/20260924000003_helpers_triggers.sql` | `private.current_org_id()`, `private.current_business_id()`, `updated_at` trigger, audit trigger |
| `supabase/migrations/20260924000004_rls_grants.sql` | RLS, SELECT-only policies, table/column grants, default privileges |
| `supabase/migrations/20260924000005_rpcs.sql` | the ten RPCs |
| `supabase/migrations/20260924000006_realtime_storage.sql` | `supabase_realtime` publication, storage buckets and policies (both guarded) |
| `supabase/migrations/20260924000007_cron.sql` | `private.invoke_cron_job()` plus the pg_cron schedule (guarded; a no-op without pg_cron/pg_net) |
| `supabase/seed.sql` | demo business "Ashgrove Hair & Beauty" (`org_demo_ashgrove`) |
| `supabase/tests/*.sql` | SQL test suite (plain `DO` blocks) |
| `supabase/config.toml` | local CLI config with Clerk third-party auth |
| `packages/shared/database.types.ts` | generated `Database` type |
| `scripts/db/test.sh` | runs everything against a throwaway Postgres |
| `scripts/db/gen-types.sh` | regenerates `packages/shared/database.types.ts` |

## Running the tests locally

You need PostgreSQL 15+ server binaries with `btree_gist` and `citext` (on Debian/Ubuntu, `postgresql-16` or `postgresql-contrib`) and Node 22 for the types check. Docker and the Supabase CLI are not needed.

```bash
scripts/db/test.sh            # add VERBOSE=1 to list every assertion
```

The script:

1. Starts a disposable cluster on a free port with its data dir in `/tmp`. When run as root, it runs the server as the `postgres` OS user and creates that user if needed.
2. Applies `scripts/db/supabase-shim.sql`. The shim stands in for what Supabase provides: the roles, `auth.jwt()`, the `supabase_realtime` publication, a minimal `storage` schema, an empty `vault` schema, and Supabase's default grants, which the migrations must revoke.
3. Applies every migration in order, then applies them all a second time to check they are idempotent, then applies `seed.sql` and every `supabase/tests/*.sql`.
4. Races 12 concurrent sessions for one slot. Exactly one must win and the rest must get `23P01`. It then races 12 sessions with the same idempotency key, and all must get back the same row.
5. Regenerates the types and fails if `packages/shared/database.types.ts` is stale.
6. Tears the cluster down. It exits non-zero on the first failure.

Override the binaries with `PG_BIN=/path/to/bin` and the port with `PG_PORT`.

After changing a migration, run `scripts/db/gen-types.sh` and commit the regenerated `packages/shared/database.types.ts`. Once a Supabase project is linked, `supabase gen types typescript --linked --schema public` produces an equivalent file. The only difference is that the CLI output also exports a runtime `Constants` object, which we omit because `packages/shared/` is types-only.

## Applying migrations to Supabase

With the CLI:

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push                 # applies supabase/migrations in order
# optional demo data (never on production):
psql "$(supabase db url --linked)" -f supabase/seed.sql   # or paste into the SQL editor
```

Without the CLI, run the migration files in filename order in the dashboard SQL editor. Every migration is safe to re-run.

Locally, `supabase start` followed by `supabase db reset` applies the migrations and the seed. You must set `CLERK_DOMAIN` first (see below).

Project settings the schema expects:

- **API → Exposed schemas:** `public` only. Never expose `private`.
- **API → Extra search path:** `public, extensions`. This is Supabase's default and is needed for `citext` operators.
- **Database → Extensions:** `pg_cron` and `pg_net` are created by migration 7 when they are available. On a hosted project they always are.

## Clerk third-party auth

The app sends Clerk session tokens straight to Supabase. RLS reads the organisation from the token as `coalesce(org_id, o.id)`, which covers both Clerk session-token v1 and v2 formats. It then maps that organisation to `businesses.clerk_org_id`.

1. **Clerk dashboard:** open *Integrations → Supabase* (or *Configure → Supabase*) and activate it. This adds the `role: "authenticated"` claim to session tokens. Without that claim, PostgREST treats the request as `anon`, and `anon` can read nothing. Copy the Clerk domain it shows (for example `your-app.clerk.accounts.dev`).
2. **Supabase dashboard:** open *Authentication → Sign In / Providers → Third-Party Auth → Add provider → Clerk* and paste the domain.
3. **Local:** `export CLERK_DOMAIN=your-app.clerk.accounts.dev` before `supabase start`. `supabase/config.toml` reads it from `[auth.third_party.clerk]`.
4. **App:** create the Supabase client with `accessToken: async () => (await clerk.session?.getToken()) ?? null`. The user must have an **active organisation** in the session. Otherwise the token has no org claim and every query returns zero rows.
5. **Backend:** the API uses the service-role key, which bypasses RLS. It resolves the business itself (see `apps/backend/src/middleware/auth.ts`).

## Vault secrets for cron

Migration 7 schedules five jobs. Each one runs `select private.invoke_cron_job('<job>')`, which reads two Vault secrets **at run time**, then POSTs to `<api_base_url>/cron/<job>` with the header `x-cron-secret`. If either secret is missing, the job logs a warning and does nothing, so the secrets can be added after the migration.

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/api', 'api_base_url');
select vault.create_secret('<same value as CRON_SECRET in the backend env>', 'cron_secret');

-- rotate:
select vault.update_secret((select id from vault.secrets where name = 'cron_secret'), '<new secret>');

-- inspect:
select jobname, schedule, active from cron.job where jobname like 'api-%';
select * from cron.job_run_details order by start_time desc limit 20;
select id, status_code, error_msg, created from net._http_response order by created desc limit 20;
```

| Job | Schedule (UTC) | Endpoint |
| --- | --- | --- |
| `api-reminders` | `*/5 * * * *` | `/cron/reminders` |
| `api-conversation-expiry` | `*/15 * * * *` | `/cron/conversation-expiry` |
| `api-waba-health` | `0 * * * *` | `/cron/waba-health` |
| `api-token-refresh` | `0 3 * * *` (05:00 SAST) | `/cron/token-refresh` |
| `api-cleanup` | `30 3 * * *` (05:30 SAST) | `/cron/cleanup` |

## Notes for the API and app workstreams

**Access model**
- `anon` has no access to anything.
- `authenticated` has SELECT on its own business's rows only. It has no access to `webhook_events` or `idempotency_keys`, and it can EXECUTE `dashboard_summary` and `business_features` and nothing else.
- `service_role` has full access.

**Reading appointments**
- PostgREST cannot filter or order on `tstzrange` bounds, and the generated types show `slot`/`blocked` as `unknown`.
- Use the generated columns `appointments.starts_at` and `appointments.ends_at` instead. They always equal `lower(slot)` and `upper(slot)`, and they are indexed.

**Embedding related tables**
- Foreign keys are composite, `(business_id, x_id) → (business_id, id)`, and named like single-column ones.
- Embeds work as usual. For example, `appointments?select=*,clients(*),staff(*),services(*)` works without hints, because each pair of tables has exactly one FK.

**`whatsapp_accounts`**
- `authenticated` has column grants that exclude `access_token_ciphertext`, so `select *` fails with `42501`.
- The app must list columns explicitly, e.g. `select('id,status,display_phone,verified_name,quality_rating,messaging_limit,token_expires_at,last_health_check_at,last_error,flow_ids')`.

**RPC errors**

| SQLSTATE / message | Maps to |
| --- | --- |
| `23P01` | `SLOT_UNAVAILABLE` |
| `P0002` | `NOT_FOUND`, with messages like `appointment not found`, `service not found`, `staff not found` |
| `P0001` with `RULE:<CODE>:<message>` | `RULE_VIOLATION` |
| `23514` / `23503` / `23505` from direct table writes | `VALIDATION_FAILED` |

The `RULE` codes in use are:
- `STAFF_NOT_QUALIFIED`, `SERVICE_INACTIVE`, `CLIENT_BLOCKED`
- `STAFF_INACTIVE` (for both inactive staff and staff not accepting bookings)
- `INVALID_STATUS`
- `IDEMPOTENCY_KEY_REUSED` (the key was used by another business)
- `INVALID_INPUT`, `INVALID_HOURS`, `OVERLAPPING_HOURS`

**Appointment RPCs and ownership**
- The appointment RPCs that take only an appointment id do not check the caller's business.
- The API must load the appointment scoped by `business_id` before calling them.

**Actor ids**
- The generated types declare RPC args as non-null, which is how `supabase gen types` renders them.
- For a system actor, pass `p_actor_id: actor.id ?? ''`. The RPCs store `''` as `null`.
- Optional args such as `p_notes` and `p_staff_id` can be omitted.

**Audit attribution**
- Audited tables: businesses, services, staff, staff_services, business_hours, availability_rules, availability_overrides, clients.
- Every PostgREST call is its own transaction, so a separate `set_request_context()` call does not carry over to the next request.
- For plain table writes, attach headers instead: `db.from('services').update(...).setHeader('x-actor-id', userId).setHeader('x-request-id', requestId)`. Optionally add `x-actor-type: customer|staff|system`.
- The audit trigger resolves the actor in this order: `app.actor_id` GUC, then the `x-actor-id` header, then `system`. An actor id without a type counts as `staff`.
- Updates that only touch `updated_at` (or `clients.last_seen_at`) are not audited.

**Nerova attribution** (migration `20261015000001_nerova_actor_source`): `appointment_source` and `actor_type` gain the label `nerova` (additive `ADD VALUE IF NOT EXISTS`). Appointments booked through the Nerova connector carry `source = nerova`, and their `appointment_events` carry `actor = nerova`. Asserted in `supabase/tests/12_nerova_actor.sql`.

**Plans and entitlements** (migration `20261014000001_plan_flags`)
- `businesses.plan` (`plan_key`, default `free`) says which plan a business is on. Only the service role writes it (future billing webhook). Clients have SELECT only and there is no API route for it.
- `plan_features(plan, feature, monthly_limit)` is the catalogue, seeded in the migration. RLS is on, `authenticated` can SELECT it and only the service role writes. Feature keys: `whatsapp_menu`, `inbox`, `companion`, `desktop_app`, `extensions`, `assistant_bookings`. `monthly_limit` is null (uncapped) everywhere until the paid-tier caps are decided.
- `business_features(p_business_id default null)` returns `(plan, feature, monthly_limit)` rows. It is SECURITY INVOKER, so RLS limits an `authenticated` caller to their own business.
- Tests: `supabase/tests/11_plan_flags.sql`. Demo seed: Ashgrove is on `free`, Harbour Barbers (`10000000-0000-4000-8000-000000000002`) is a bare `growth` business.

**`dashboard_summary(p_date)`**
- The month is the calendar month containing `p_date`, in `businesses.timezone`.
- Revenue counts `confirmed + completed` appointments, bucketed by local start date.
- `revenue_by_day` lists every day of the month, including days with zero revenue.
- `today` counts appointments that start on `p_date`. `checked_in` excludes cancelled appointments.
- `next_appointment_id` is the earliest confirmed appointment on `p_date` that is not checked in and has not ended.

**`claim_due_reminders`**
- An offset is due when `start - offset <= p_now` and it is not more than 30 minutes overdue.
- Every claim is written as a `reminder_sent` event with payload `{offset_minutes, starts_at, state: 'claimed'}`.
- WS-C may later update `payload.state` (for example to `sent` or `failed`) but must keep `offset_minutes` and `starts_at`.

**Replace RPCs**
- `replace_business_hours` takes rows `[{weekday, opens_at, closes_at}]` with times as `"HH:mm"`.
- `replace_staff_availability` takes `[{weekday, start_time, end_time}]`. An empty array means the staff member inherits business hours.
- Both return the resulting rows. They apply the replace as a diff, so unchanged rows keep their ids and their audit history.

**Storage**
- Upload to `logos/<business_id>/...` and `staff-photos/<business_id>/...` with the member's token.
- Both buckets are public-read through the public URL.
- `whatsapp-media` is service-role only.

## Deviations from BUILD_PLAN

Deviations are kept to a minimum. Each one fixes something the plan as written cannot do, or adds to the plan without changing any listed name.

1. **`reschedule_appointment` parameter order.** The planned order was `(p_appointment_id, p_starts_at, p_staff_id default null, p_actor, p_actor_id)`. Postgres rejects that, because parameters that follow a defaulted parameter must also have defaults. The function is `(p_appointment_id, p_starts_at, p_actor, p_actor_id, p_staff_id default null)`. The names, types and required/optional status are unchanged, and PostgREST and supabase-js call by name, so callers are unaffected.
2. **Reminder uniqueness includes the start time.** The unique index is on `(appointment_id, payload->>'offset_minutes', payload->>'starts_at') where type = 'reminder_sent'`, and the claim payload gains `starts_at`. With the index as planned, a rescheduled appointment could never be reminded about its new time. The index still guarantees one reminder per offset per start time.
3. **`appointments.starts_at` / `ends_at` generated columns** (additive). They are stored, not null, and indexed as `(business_id, starts_at)`. PostgREST clients cannot filter or order on range bounds, and the DTOs already use these names. The planned `(business_id, lower(slot))` index also exists.
4. **Return types of the replace RPCs.** The plan does not specify them. They return `setof` the affected table (the rows after the replace) rather than `void`. `set_request_context` returns `void`.
5. **`device_push_tokens` has `business_id`**, so push can target all members of a business. Its SELECT policy also restricts rows to the caller's own tokens (`user_id = jwt.sub`).
6. **Idempotency key used by a different business** raises `P0001 RULE:IDEMPOTENCY_KEY_REUSED:…`. The API sees `RULE_VIOLATION` with `details.rule = 'IDEMPOTENCY_KEY_REUSED'`, which it can translate to its own `IDEMPOTENCY_KEY_REUSED` code. Staff that exist but do not accept bookings raise `RULE:STAFF_INACTIVE` with a distinct message.
7. **Extra bookkeeping columns.**
   - `audit_log` and `appointment_events` have `created_at` alongside `occurred_at`.
   - `webhook_events` has `id`, `created_at` and `updated_at`.
   - `idempotency_keys` has `created_at` and `updated_at`.
   - These follow the plan's "all tables have id/created_at; mutable tables have updated_at" rule.
8. **Extra integrity checks.** None of these reject valid data:
   - `appointments`: `cancelled ⇔ cancelled_at is not null`, the slot length equals `duration_minutes`, and `lower(blocked) = lower(slot)`.
   - Enumerated values for `escalations.reason`, `webhook_events.source` and `device_push_tokens.platform`, taken from the plan and the DTOs.
   - `slug` format and uppercase ISO `currency`.
   - An open (not closed) override must have a valid window.
9. **FK semantics.**
   - `users.business_id` uses `on delete set null`, because users outlive a business.
   - `appointments → clients/staff/services` use `NO ACTION`: it has restrict semantics but is checked at the end of the statement, so deleting a business still cascades.
   - The nullable references on `booking_attempts` use `on delete set null (col)`.
   - `audit_log.business_id` has no FK, so history survives deleting a business.
10. **Audit context fallback** (additive). Besides `app.actor_id` / `app.request_id`, the trigger reads PostgREST's `x-actor-id` / `x-request-id` / `x-actor-type` request headers. Without them, plain table writes through PostgREST could never be attributed.
11. **`check_in_appointment`** requires a `confirmed` appointment (otherwise `RULE:INVALID_STATUS`). Checking in again is a no-op: it returns the row and writes no second event.
12. **Types file.** It is generated by `scripts/db/gen-types.mjs`, sets `__InternalSupabase.PostgrestVersion = "12"`, and omits the runtime `Constants` export.
