---
paths: apps/backend/src/whatsapp/**/*.ts,apps/backend/src/routes/whatsapp/**/*.ts,apps/backend/whatsapp/**
description: Rules for the deterministic WhatsApp conversation engine, Flows, windows and templates
---

# WhatsApp Engine

The customer channel is a deterministic state machine: no AI and no free-text interpretation. See [BUILD_PLAN.md](/docs/BUILD_PLAN.md) §5 and [whatsapp.md](/docs/whatsapp.md).

## Implementation

1. Keep `transition(snapshot, input)` pure, returning `{ state, context, actions }`. All I/O (Graph, DB, BookingService) happens in the executor.
2. Parse replies only by the structured ID grammar (`svc:<uuid>`, `day:<date>`, `slot:<iso>|<staff>` …). Malformed or unexpected input gets a fixed re-prompt, and the 3rd strike escalates.
3. Add a conversation state in the migration check constraint, BUILD_PLAN §5, the transition table and the tests together.
4. Enforce WhatsApp limits in builders: ≤3 reply buttons (title ≤20), lists ≤10 rows (title ≤24, description ≤72), body ≤1024, ids ≤200.
5. Send free-form or interactive messages only inside `window_expires_at`. Outside the window, use approved templates.
6. Assume at-least-once delivery: dedupe via `webhook_events`, keep handlers idempotent, and persist state with compare-and-set on `conversations.version`.
7. Book through `BookingService` with deterministic keys (`wa:<wamid>`, `wa-flow:<token>:<slot>`). Store every outbound message, and record `booking_attempts` steps.

## Examples

```typescript
// ✅ DO
case 'select_service':
  if (input.kind === 'list' && isServiceId(input.id)) return toSelectStaff(snapshot, parseServiceId(input.id));
  return reprompt(snapshot);

// ❌ DON'T: interpret free text
if (input.text.toLowerCase().includes('haircut')) …
```
