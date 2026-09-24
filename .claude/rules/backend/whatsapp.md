---
paths:
  - "backend/src/whatsapp/**/*.ts"
  - "backend/src/notifications/**/*.ts"
  - "backend/src/routes/whatsapp/**/*.ts"
  - "backend/whatsapp/**"
---

# WhatsApp channel

- The engine is **deterministic**: `transition(snapshot, input)` is a pure function returning `{ state, context, actions }`. All I/O happens in the executor. Never call the network or DB from a transition.
- Never interpret free text. Inputs are typed events. Replies are parsed by the structured ID grammar (`svc:<uuid>`, `day:<date>`, `slot:<iso>|<staff>` …). Unknown or malformed input gets a fixed re-prompt, and the 3rd strike escalates.
- New conversation states must be added to the DB check constraint (migration), `docs/BUILD_PLAN.md` §5, the transition table and the tests, all together.
- Respect WhatsApp limits in builders: ≤3 reply buttons (title ≤20), lists ≤10 rows (title ≤24, description ≤72), body ≤1024, ids ≤200.
- 24h window: free-form or interactive messages only inside `window_expires_at`. Outside it, approved templates only.
- Webhooks are at-least-once: dedupe via `webhook_events`, make every handler idempotent, always return 200 for authentic payloads.
- Booking side effects go through `BookingService` with deterministic idempotency keys (`wa:<wamid>`, `wa-flow:<token>:<slot>`).
- Store every outbound message in `messages`. Record `booking_attempts` steps for the research instrumentation.
