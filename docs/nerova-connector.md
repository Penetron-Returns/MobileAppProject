# Nerova Booking connector

Lets Nerova's AI companion (Pip) read and act on the bookings of paid-plan businesses. We implement **Nerova Booking MCP v1** (contract `2026-10-12`) as an MCP server inside the existing `api` Edge Function. Spec: Nerova docs `guides/nerova-booking-mcp-v1`, `guides/build-an-mcp-booking-connector`, `guides/booking-mcp-tool-schemas`, `guides/booking-connector-contract`.

Contract summary lives in [BUILD_PLAN.md](BUILD_PLAN.md) (section "Nerova Booking connector"). This page is the design and the runbook.

## Why MCP and not the REST "Custom connector"

Nerova recommends MCP, and the Edge runtime serves it cleanly. Streamable HTTP lets a server answer each JSON-RPC `POST` with a plain JSON body and no session, which is exactly what a stateless Edge Function is good at. So there is no SDK dependency and no long-lived connection: `routes/nerova.ts` authenticates, `packages/companion/connector/mcp.ts` (about 100 lines, pure) speaks JSON-RPC, and the Hono app is unchanged otherwise. It is proven under Deno (`packages/database/supabase/functions/api/smoke.test.ts`). The REST contract has the same behaviour but needs a manifest, capability negotiation and header plumbing for no gain.

## Architecture

```
Nerova (MCP client) ──POST /connector/nerova/mcp, Bearer──▶ routes/nerova.ts   auth, parse, log, HTTP status
                                                           └▶ companion/connector/mcp.ts     JSON-RPC: initialize, tools/list, tools/call
                                                              └▶ connector/tools.ts   tool registry (published schema + zod args + handler)
                                                                 └▶ connector/service.ts  maps tools onto ports
                                                                    ├ BookingService   (availability, create / reschedule / cancel, get, list)
                                                                    ├ EntitlementService (who is on `companion`)
                                                                    └ BookingRepository  (read-only lookups: staff, hours, clients)
BookingService ─▶ RPCs create_appointment / reschedule_appointment / cancel_appointment ─▶ Postgres (exclusion constraint)
```

Rules kept: the connector layer never writes a table (writes go through `BookingService`, clients through `upsertClient` like `/v1`); everything is scoped by `business_id`; availability is computed live; money is integer cents; instants are ISO-8601 UTC, calendar values use the business time zone.

| File | Role |
| --- | --- |
| `apps/api/src/routes/nerova.ts` | HTTP transport, bearer check, body limit, logging (tool name and result code only) |
| `packages/companion/connector/mcp.ts` | JSON-RPC handler: `initialize`, `ping`, `tools/list`, `tools/call`; tool failures become `isError` results |
| `packages/companion/connector/booking-connector.mcp-tools.json` | The published tool definitions, verbatim from Nerova. `tools/list` returns exactly this; a test pins it |
| `packages/companion/connector/tools.ts` | Registry joining each definition to its zod argument schema and handler |
| `packages/companion/connector/args.ts` | zod v4 argument schemas (unknown arguments are ignored, as v1 only adds) |
| `packages/companion/connector/service.ts` | The tools' behaviour |
| `packages/companion/connector/mappers.ts` | Internal rows to wire shapes (status, opening hours, money) |
| `packages/companion/connector/errors.ts` | `ConnectorError` and the `AppError` to connector code mapping |
| `packages/companion/connector/auth.ts` | Hashed bearer token check |
| `packages/companion/events/events.ts` | Signed account events (Standard Webhooks) behind `AccountEventSender` |

## Tools to services

An **account** is a business (`accountId` = `businesses.id`; it is also the account's single location id). Only businesses whose plan carries `companion` (starter, growth, pro) exist for Nerova. A Free business, an unknown id and a malformed id are all `not_found`, on every tool, and the check runs live on each call, so a downgrade hides the account immediately.

| Tool | Read only | Backed by | Notes |
| --- | --- | --- | --- |
| `accounts_list` | yes | `EntitlementService.listBusinessIdsWithFeature('companion')` + `BookingService.getBusiness` + hours | Keyset pagination on business id (`limit` default 50, max 100; `cursor` is the last id) |
| `accounts_get` | yes | same | `displayName` = name, `timeZone`, `currency`, one location, `openingHours` (weekly `HH:mm` ranges from `business_hours`; business-wide `business_special_days` (closed days and special hours, the name sent as `reason`) for the next 180 days as exceptions; a closing time of `24:00` is sent as `23:59`) |
| `services_list` | yes | `BookingService.listServices({ activeOnly })` | `price` = `{ amountCents, currency }`, optional `category` and `description` |
| `staff_list` | yes | `BookingRepository.listStaff` / `listStaffServices` | Active staff that accept bookings, with the active services each performs |
| `availability_search` | yes | `BookingService.listAvailableSlots` per business day in the window | One entry per (slot, free staff member), inside `[start, end)`, window at most 31 days, days are computed 4 at a time; unknown service or staff is `not_found`. It is the same engine as the app, so staff breaks, time off and closed special days are never offered |
| `appointments_get` | yes | `BookingService.getAppointment` | Reflects writes immediately; status `confirmed/cancelled/completed/no_show` becomes `Scheduled/Cancelled/Completed/NoShow` |
| `appointments_list` | yes | `BookingService.listAppointments` (new) + lookups for names | Window at most 31 days, filters `staffId`, `clientId`, `clientPhone` (normalised to E.164), `status`; keyset cursor on `(starts_at, id)`; includes `serviceName`, `staffName`, `clientName`, `clientPhone` |
| `appointments_create` | no | `BookingService.createAppointment` | See below |
| `appointments_reschedule` | no | `BookingService.rescheduleAppointment` | `newExternalStaffId` optional |
| `appointments_cancel` | no | `BookingService.cancelAppointment` | `reason` stored as `cancel_reason` |

### Writes

- **Idempotency:** the database key is `nerova:<accountId>:<idempotencyKey>` (the column is globally unique, so the account id keeps businesses apart). A replay returns the first appointment even if the retry carries different details. A missing or empty `idempotencyKey` is `invalid_request`.
- **Client:** `client.externalClientId` (must exist in the account) or `client.phone` (E.164 or a local number; created or reused through `upsertClient`). A phone is required because clients are keyed by phone. A client without either is `invalid_request`.
- **Audit:** the booking has `source = nerova`; `appointment_events` get `actor = nerova` and `actor_id = nerova` or `nerova:<conversationId>`. The audit migration is `20261015000001_nerova_actor_source.sql`.
- **No customer messages from us:** `notifyCustomer: false`. Pip talks to the customer itself, and paid plans do not include our WhatsApp menu. Owners still get the push notification for Pip's changes (same as customer-made ones).
- **Cancellation window:** reschedule and cancel are held to `cancellation_window_minutes` **by default**. Customer channels (`whatsapp`, `voice`, `flow`) and a missing or unrecognised origin are held to it. Only the non-customer channels `owner`, `owner_chat` and `owner_whatsapp` (the owner directing Pip; Nerova sends the last two and never `owner`), `system` and `conformance` (Nerova's own jobs and connection certification, which books the soonest slot then reschedules and cancels it) skip it, so a bug or an old client can never bypass the owner's rule for a customer. Availability, lead time, the horizon and the exclusion constraint apply to every channel, creates included.
- **Instants:** every `startTime`, `newStartTime`, `start`, `end`, `from` and `to` must carry an explicit offset (`Z` or `+hh:mm`); a local time without one is `invalid_request`.
- **Existing clients:** `appointments_create` with a phone only fills blank name and email of an existing client; it never overwrites what the owner stored.
- **Same-key races:** a create that loses the slot to a concurrent call with the same `idempotencyKey` returns that booking instead of `conflict`.
- **Notes:** `notes` and `reason` are merged into the appointment notes (`Reason: ...`). `subject`, `intakeResponses` and `externalLocationId` are accepted and ignored (single location, no subjects or intake forms yet).

### Errors

Failures are tool results with `isError: true`, `structuredContent: { code, detail }` and `content: [{ type: 'text', text: code }]`.

| Code | Produced by |
| --- | --- |
| `invalid_request` | zod argument failure, bad window (end before start, over 31 days), bad cursor, bad phone, missing `idempotencyKey` |
| `unauthorized` | Only at HTTP level (401). A tool never runs without a valid token |
| `not_found` | Unknown, malformed or non-companion account; unknown service, staff, client or appointment (a malformed id is `not_found`, never a validation error) |
| `conflict` | Slot taken or outside hours, inactive service or staff, blocked client, appointment not confirmed, cancellation window |
| `rate_limited` | Reserved (`retryAfterSeconds` supported). Not produced yet: there is no per-connector limiter |
| `provider_unavailable` | Anything unexpected, with a fixed message that never leaks internals |

Protocol-level: an unknown tool name is JSON-RPC `-32602`, an unknown method `-32601`, bad JSON HTTP 400 with `-32700`.

## Authentication and credentials

Bearer, as `authMethod: bearer`. We generate a high-entropy token and give it to Nerova (write-only secret on the connection). **Only its SHA-256 hash is configured on our side**, in `NEROVA_CONNECTOR_TOKEN_HASHES` (comma-separated hex, so two hashes allow rotation without downtime). The plaintext is never in env, code or logs; comparison is constant-time over every configured hash. An unset or malformed list disables the connector (every request is 401). A browser `Origin` header is rejected with 403.

Generate a token and its hash:

```bash
node -e "const c=require('crypto');const t=c.randomBytes(32).toString('base64url');console.log('token',t);console.log('hash',c.createHash('sha256').update(t).digest('hex'))"
```

Set the hash (not the token) as a Supabase secret: `supabase secrets set NEROVA_CONNECTOR_TOKEN_HASHES=<hash>`. To rotate: add the new hash next to the old one, update the connection secret in Nerova (`PATCH /v1/connections/{id}`), then remove the old hash.

OAuth (`authMethod: oauth`) is not implemented; bearer is the documented default.

## Account events (outbound, off by default)

Nerova can be told when an account changed instead of waiting for its daily reconcile. `nerova/events.ts` signs `{ id: "evt_...", type, createdAt, data: { id } }` with Standard Webhooks (`webhook-id`, `webhook-timestamp` in Unix seconds, `webhook-signature: v1,<base64 HMAC-SHA256 of "<id>.<timestamp>.<body>">`, key = base64-decoded part after `whsec_`) and POSTs it to `events.url`.

- **Only `account.updated` is emitted today**, after `PATCH /v1/business` and `PUT /v1/business/hours` succeed. `account.created` and `account.removed` exist on `AccountEventsPort` but nothing calls them yet: there is no plan-change route (a new business starts on Free, so it is never entitled at onboarding), and the plan-change webhook (task 6.4) will call them when a business gains or loses `companion`. Until then Nerova learns about those changes from its daily reconcile.
- `created` and `updated` are only sent for businesses entitled to `companion` (a Free business is never announced); `removed` is always sent.
- Best effort, one attempt, 5 s timeout. Delivery runs in the background (`EdgeRuntime.waitUntil` on Supabase, a caught promise elsewhere), so a slow or failing Nerova never delays or fails the owner's request. Nerova reconciles daily.
- **Disabled unless** `NEROVA_EVENTS_ENABLED=true` and `NEROVA_EVENTS_URL` (https, or loopback for tests) and `NEROVA_EVENTS_SIGNING_SECRET` (`whsec_...`) are set. Nothing is sent to Production by default.

Appointment changes made in our app are not events: Nerova reads appointments live through `appointments_list` and `appointments_get`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEROVA_CONNECTOR_TOKEN_HASHES` | SHA-256 hex hashes of accepted bearer tokens. Empty disables the connector |
| `NEROVA_EVENTS_ENABLED` | `true` to send account events |
| `NEROVA_EVENTS_URL` | The connection's `events.url` |
| `NEROVA_EVENTS_SIGNING_SECRET` | The connection's `events.signingSecret` (`whsec_...`) |
| `NEROVA_NATIVE_SESSIONS` | `true` lets `platform: "native"` companion session requests use Nerova native sessions. Anything else: always web |
| `NEROVA_APP_ID` | `nativeApps` appId for native sessions (default `si.nerova.booking.dev`) |
| `VOICE_CLOUD_STT` | `true` enables `POST /v1/voice/transcriptions` (Nerova speech-to-text). Default off: the route answers 503 `TRANSCRIPTION_UNAVAILABLE`. |
| `NEROVA_WHATSAPP_RETURN_URL` | `true` forwards the allowlisted `return_url` (`bookingadmin://companion/whatsapp-return`) to connection-sessions as `returnUrl` |

All are in `apps/api/.env.example` with comments.

## Register it in Nerova's Test environment

Do this against Nerova **Test**, never Production, and only after the migration and the function are deployed to the matching Supabase project.

1. Deploy: `supabase --workdir packages/database db push` (migration `20261015000001`), then `supabase --workdir packages/database functions deploy api`.
2. Generate a token and hash (above); `supabase secrets set NEROVA_CONNECTOR_TOKEN_HASHES=<hash>`.
3. Make sure at least one test business is on a paid plan (`update public.businesses set plan = 'starter' where ...`), has a service, a qualified staff member, hours and an open slot in the next 14 days. Nerova's run certifies against the **first listed account**.
4. Self-check (below) against the deployed URL: `https://<project-ref>.supabase.co/functions/v1/api/connector/nerova/mcp`.
5. In Nerova Test: `connections_create` with `type: "mcp"`, that endpoint URL and the token as `secret` (authMethod `bearer`), then `connections_verify`. It lists the accounts, certifies against the first and imports all of them. Poll `get_account` until `provisioningState` is `ready`, then `get_companion_setup` (task 6.2 aims for `nextStep: none`).
6. Optional events: copy `events.url` and `events.signingSecret` from the connection into `NEROVA_EVENTS_URL` / `NEROVA_EVENTS_SIGNING_SECRET`, set `NEROVA_EVENTS_ENABLED=true`, and redeploy secrets. Edit a business name in the app and confirm Nerova re-reads the account.

## Checking it

- `cd apps/api && npx tsc --noEmit && npx vitest run` covers every tool through `createApp` with fakes (`test/nerova/`): happy paths, validation errors, auth failures, not found, conflicts, idempotent replay, Free-plan businesses hidden, event signing.
- `npm run check:edge && npm run test:edge` proves the connector boots and lists its tools under Deno.
- `scripts/db/test.sh` includes `packages/database/supabase/tests/12_nerova_actor.sql` (the `nerova` source and actor).
- **`@nerova/connector-check`:** the docs describe version `0.3.0-preview.1` (MCP is its default mode, `--rest` checks a Custom connector), but only `0.1.0-preview.1` (an older merchant-based REST checker with no MCP mode) is published on npm. Until the MCP-capable release ships, use our mirror of its documented checks: `node packages/companion/scripts/nerova-selfcheck.mjs <mcp-url> --credential <token> [--account-id <id>] --write` (handshake, ten tools and schemas, bearer enforcement, accounts, availability, create with read-back, idempotent replay, conflict, reschedule, cancel, error codes). When `@nerova/connector-check` with MCP support is available, run `npx @nerova/connector-check <mcp-url> --credential "$TOKEN" --write` too. Use a test account with `--write`.

## Switching on native sessions and the WhatsApp returnUrl (Nerova PR #946)

Built behind config, off by default; no code change is needed to enable. Once Nerova confirms #946 is live:

1. Run `NEROVA_API_KEY=... node apps/api/scripts/register-nerova-native-app.mjs --dry-run`, then without `--dry-run`. It GETs `/v1/embed-origins`, keeps the existing `origins` (and other native apps), and PUTs `nativeApps: [{ appId: "si.nerova.booking.dev", returnUrlSchemes: ["bookingadmin"] }]`. It never runs automatically.
2. Set `NEROVA_NATIVE_SESSIONS=true` and/or `NEROVA_WHATSAPP_RETURN_URL=true` as Supabase secrets.

**Contract (confirmed by Nerova from main):** native widget body `{ widget, ownerReference, theme, platform: "native", appId }` with no `origin` (an origin is 422 `widget.origin_unexpected`); response `{ sessionId, url, expiresAt, state }` (`state` null for web). GET `/v1/embed-origins` returns `{ origins, nativeApps }`; PUT requires `origins` (always the existing list, which must include the Supabase API origin) plus `nativeApps: [{ appId, returnUrlSchemes, returnUrlOrigins? }]`, max 10 apps. The script refuses to PUT when GET returns no origins. Connection-sessions send `returnUrl` together with `appId`. Errors are 422 with prefixed codes `activation.return_url_not_allowed` and `activation.app_not_registered`; we map those (and `widget.origin_unexpected`), whether 400 or 422, to 502 `UPSTREAM_COMPANION_ERROR` with `details.reason` `return_url_not_allowed` / `app_not_registered` / `origin_unexpected`.

## Connecting WhatsApp from the app

Nerova's chat widget opens a popup to connect WhatsApp, which cannot work inside our WebView, so the app does it natively: `GET /v1/companion/setup` (owner) tells it the `next_step` and WhatsApp status, and `POST /v1/companion/whatsapp/connect-session` (owner, Idempotency-Key) returns a `launch_url` to open in the system browser. Nerova calls used (the local `tenant-v1.openapi.json` is stale; the current contract is `nerova-api-v1.openapi.json` on Nerova's main): `GET /v1/accounts/{id}/companion/setup` (`CompanionSetupResponse`: `nextStep`, `version` (int64, the activation version), `receptionistLive`, `whatsApp.{connected,state,displayPhoneNumber,businessVerified}`), `POST /v1/accounts/{id}/widgets/sessions` (owner chat; body `{ widget: "owner_chat", origin, ownerReference, theme: { colorMode }, layout: "fill", avatar: "hidden" }`: the app embeds the chat in its own sheet and draws its own character, so we always send `layout` and `avatar`; an invalid value is 400 `widget.presentation_invalid`, surfaced as `UPSTREAM_COMPANION_ERROR` with that `nerova_code`), `POST /v1/accounts/{id}/connection-sessions` (body `{ channel: "whats_app", embedOrigin, expectedVersion }`, required `Idempotency-Key` of 8 to 255 characters, 201 `{ launchUrl, expiresAt, sessionId, state, version, ... }`). The channel enum value is `whats_app`. Errors: 409 `activation.not_provisioned` maps to `COMPANION_NOT_READY` / `not_provisioned`; a stale `expectedVersion` is 409 `activation.version_conflict` (it was 412 and a separate `GET .../activation-manifest` until Nerova removed that endpoint in PR #925) and is retried once after a fresh setup read; Nerova has no "already connected" error on session creation, so we check setup `whatsApp.connected` first and answer 409 `WHATSAPP_ALREADY_CONNECTED`. The API key needs the scopes for these activation calls. The launch URL (`#state=`) is a secret: never logged. TODO: forward `return_url` as `returnUrl` when Nerova adds it to the request schema.

## Voice transcription (cloud speech-to-text)

`POST /v1/voice/transcriptions` (owner and staff, feature `companion`, Idempotency-Key required) takes the short WAV clip the Clovie app records after the wake word and proxies it to Nerova: `POST https://api.nerova.si/v1/accounts/{acct}/transcriptions`, bearer `NEROVA_API_KEY`, multipart field `audio`, `language` only when the client sent one (otherwise Nerova auto-detects English and Afrikaans), 15 s timeout. Nerova answers `{ text, durationMs, language }` plus a `Server-Timing` header, which we log as `provider_ms`. The contract is confirmed but not live yet; until Nerova confirms a real production transcription the flag `VOICE_CLOUD_STT` stays off (route answers 503 `TRANSCRIPTION_UNAVAILABLE`, as it does for a Nerova 404). Error mapping, size limit and the idempotency exemption for multipart are in docs/BUILD_PLAN.md (route table). Audio and transcript are never logged or stored.

## Known gaps and decisions

- A client **phone number is required** on `appointments_create` (the contract makes it optional). If Nerova's certification run books without one, it fails `lifecycle.create_verify`; the fix would be a phone-less client model.
- No per-connector rate limiter (`rate_limited` is supported by the error format but never emitted).
- No OAuth, no optional extra tools (clients, sales, loyalty, gift cards, subjects), no streaming or sessions.
- Single location per business. `externalLocationId` is the business id.
- Production safety: the connector only exposes `companion` businesses, and events never send unless explicitly enabled.
