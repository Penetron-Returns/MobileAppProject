---
paths: packages/companion/**,apps/api/src/routes/nerova.ts,apps/api/test/nerova/**/*.ts
description: Rules for the Booking connector (MCP) and account events in packages/companion
---

# Companion Connector

`packages/companion` is the AI layer the paid plans depend on and the part other platforms read to learn the Booking connector contract. It is a product dependency, not a plugin: plans gate on the plan, never on whether it is installed. Design and runbook: [nerova-connector.md](/docs/nerova-connector.md). Reader-facing overview: [README.md](/packages/companion/README.md).

## Implementation

1. Import only `@booking/features` ports and services, `@booking/types` and database types. Never import `@booking/app-store`, `apps/*` or Hono (`npm run check:boundaries` enforces it).
2. Keep `connector/mcp.ts` pure JSON-RPC. The route in `apps/api/src/routes/nerova.ts` owns auth, HTTP status and logging.
3. Write only through `BookingService` and `upsertClient`. The connector never writes a table, and every write carries an idempotency key (`nerova:<accountId>:<key>`).
4. Treat the pinned `booking-connector.mcp-tools.json` as the published contract. Add an optional tool by registering a binding in `connector/tools.ts`; a breaking change needs a new contract version.
5. Expose only businesses entitled to `companion`, checked live on every call. A free, unknown or malformed account is `not_found`.
6. Type env reads as small structural interfaces (`ConnectorEnv`, `EventsEnv`), never `Env`. Hash bearer tokens, compare in constant time and never log tokens or customer data.
7. Keep the vendor out of structure names where you can; keep Nerova protocol names where they are part of the contract.
8. Update the README, `docs/nerova-connector.md` and `docs/BUILD_PLAN.md` in the same change as any contract change, and run `node packages/companion/scripts/nerova-selfcheck.mjs` against a running connector.

## Examples

```typescript
// ✅ DO: reach the schedule through a features port
const appointment = await booking.createAppointment({ …, source: 'nerova', idempotencyKey: `nerova:${accountId}:${key}`, actor });

// ❌ DON'T: write appointments directly or import another add-on
await db.from('appointments').insert({ … });
import { getWaDeps } from '@booking/app-store/whatsapp/deps.ts';
```
