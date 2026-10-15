# @booking/companion

The AI layer the paid plans depend on, and the part of this repository other platforms are meant to read.
It contains the **Booking connector**: a small MCP server that lets an AI companion (Nerova's Pip today)
read and act on a business's bookings. Everything here is named for its role, not the vendor, except the
protocol names that are part of Nerova's published contract.

It depends only on the ports in `@booking/features` and the DTOs in `@booking/types`. Nothing here knows about
Hono, Supabase clients or the apps. `dependency-cruiser` enforces that (`npm run check:boundaries`).

## What the connector is

A platform that owns a booking schedule exposes it to the companion as ten tools. The companion calls them to
answer "what is free on Friday?" and to book, move or cancel on a customer's behalf. We implement
**Nerova Booking MCP v1, contract `2026-10-12`** (`CONTRACT_VERSION` in `connector/tools.ts`).

```
connector/
  mcp.ts       JSON-RPC: initialize, ping, tools/list, tools/call (pure, no HTTP)
  tools.ts     tool registry: published definition + zod argument schema + handler
  args.ts      zod argument schemas (unknown arguments are ignored: v1 only adds)
  service.ts   the tools' behaviour, written against BookingService / EntitlementService / BookingRepository
  mappers.ts   internal rows to wire shapes (status names, opening hours, money)
  errors.ts    ConnectorError and the mapping from our errors to the contract's error codes
  auth.ts      hashed bearer token check
  booking-connector.mcp-tools.json   the published tool definitions, verbatim; a test pins tools/list to it
events/
  events.ts    signed account events (Standard Webhooks) behind a sender port
scripts/
  nerova-selfcheck.mjs   conformance self-check against a running connector
```

The HTTP route that mounts the connector (`/connector/nerova/mcp`) lives in `apps/api/src/routes/nerova.ts`.
It authenticates, parses, logs and picks the HTTP status; the protocol and behaviour are all here.

## Transport

MCP over **streamable HTTP**, stateless: the client `POST`s one JSON-RPC message and gets one JSON body back.
No session id, no SDK, no long-lived connection, which suits an Edge Function. Supported protocol versions are
`2025-06-18`, `2025-03-26` and `2024-11-05`. An unknown tool is JSON-RPC `-32602`, an unknown method `-32601`,
bad JSON is HTTP 400 with `-32700`. A tool failure is a normal result with `isError: true` and
`structuredContent: { code, detail }`; the code is one of `invalid_request`, `not_found`, `conflict`,
`rate_limited`, `provider_unavailable` (`unauthorized` only exists as HTTP 401).

## Tools

| Tool                      | Read only | What it does                                                                  |
| ------------------------- | --------- | ----------------------------------------------------------------------------- |
| `accounts_list`           | yes       | Businesses entitled to the companion, keyset-paginated                        |
| `accounts_get`            | yes       | Name, time zone, currency, one location, weekly opening hours and exceptions  |
| `services_list`           | yes       | Active services with duration and price (integer cents)                       |
| `staff_list`              | yes       | Bookable staff and the services each performs                                 |
| `availability_search`     | yes       | Free (slot, staff) pairs in a window of at most 31 days, computed live        |
| `appointments_get`        | yes       | One appointment, reflecting writes immediately                                |
| `appointments_list`       | yes       | Appointments in a window, filters, keyset cursor                              |
| `appointments_create`     | no        | Books through `BookingService`, atomically, idempotent                        |
| `appointments_reschedule` | no        | Moves an appointment, revalidated against availability                        |
| `appointments_cancel`     | no        | Cancels, with an optional reason                                              |

An **account** is a business. Only businesses whose plan carries the `companion` feature are visible; a free
business, an unknown id and a malformed id are all `not_found`, checked live on every call.

## Authentication

Bearer token. We generate a high-entropy token and give it to the platform (write-only). **Only the SHA-256 hash
is configured on our side** in `NEROVA_CONNECTOR_TOKEN_HASHES` (comma-separated, so two hashes allow a
zero-downtime rotation). Comparison is constant-time over every configured hash, an unset list disables the
connector (every request is 401), and a browser `Origin` header is rejected.

## Idempotency

Every write carries an `idempotencyKey`. The stored key is `nerova:<accountId>:<idempotencyKey>`, so a replay
returns the first appointment even when the retry carries different details, and a create that loses a race to
the same key returns that booking instead of `conflict`. A missing key is `invalid_request`. Double booking is
impossible by construction: the database exclusion constraint is the last word, never an application check.

## Contract version

`2026-10-12`, read from the published tool definitions. Version 1 only adds: unknown arguments are ignored and
new optional tools are added by registering a binding in `connector/tools.ts`.

## Run the conformance check

Unit and protocol tests run with the rest of the API suite:

```bash
cd apps/api && npx vitest run test/nerova
```

To check a running connector (a local `npm run serve`, or a deployed one) use the self-check. It performs the
handshake, lists the ten tools and their schemas, checks bearer enforcement, then reads accounts, services and
availability. With `--write` it also creates a booking and reads it back, replays it, provokes a conflict,
reschedules, cancels and checks the error codes. Use a test account with `--write`.

```bash
node packages/companion/scripts/nerova-selfcheck.mjs <mcp-url> --credential <token> [--account-id <id>] [--write]
```

The full design, the runbook for registering the connector and the known gaps are in
[docs/nerova-connector.md](../../docs/nerova-connector.md).

## Rules for changes here

- Behaviour changes need a test in `apps/api/test/nerova` and, if the contract moves, an update to the pinned
  tool definitions and `docs/BUILD_PLAN.md` in the same PR.
- Never import `@booking/app-store`, `apps/*` or Hono. Reach the schedule only through `@booking/features` ports.
- Never log customer data. Log the tool name and the result code only.
