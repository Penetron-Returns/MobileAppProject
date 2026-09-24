---
description: Load-bearing architecture boundaries between app, API, database and WhatsApp (always loaded)
---

# Architecture

These boundaries hold the system together. Breaking one requires a [BUILD_PLAN.md](/docs/BUILD_PLAN.md) change in the same PR.

## Implementation

1. Read in the app through Supabase (RLS scopes rows to the caller's business). Write only through the backend API. The app never holds the service-role key or Meta tokens.
2. Treat Postgres as the single source of truth. Compute availability live and never cache it. The exclusion constraint prevents double booking, so never replace it with an application-level check.
3. Keep backend layering one-directional: `routes/*` → services (`booking/`, `whatsapp/`, `notifications/`) → repositories → `db`. Services never import Hono.
4. Cross modules only through ports. WhatsApp code books via `BookingService` and never writes `appointments` directly.
5. Keep `packages/shared/` types-only: no runtime imports. Change it additively and update both sides together.
6. Keep the WhatsApp engine deterministic: no AI, no free-text interpretation. Unexpected input gets a fixed re-prompt or escalation.
7. Make every mutation idempotent (an `Idempotency-Key` on API calls, deterministic keys for WhatsApp and web bookings) and audited (`appointment_events`, `audit_log`).
8. Scope every service-role query by `business_id`. RLS is the last line of defence, not the first.
9. Use ISO-8601 UTC for instants, business-timezone `YYYY-MM-DD`/`HH:mm` for calendar values, weekday `0 = Sunday`, and integer cents for money.

## Examples

```typescript
// ✅ DO: the WhatsApp executor books through the port
await booking.createAppointment({ businessId, clientId, serviceId, staffId, startsAt, source: 'whatsapp', idempotencyKey: `wa:${wamid}`, actor });

// ❌ DON'T: write appointments from WhatsApp code
await db.from('appointments').insert({ … });
```
