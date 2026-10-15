---
description: SOLID and core engineering principles applied to this codebase (always loaded)
---

# Engineering Principles

Write code a teammate can change safely in six months. Prefer boring, explicit code over clever code. These principles apply to the app, backend and database alike.

## Implementation

1. Apply **Single Responsibility**: one reason to change per module.
   - Backend: route handlers parse, authorise and shape HTTP. Services own business rules. Repositories own persistence
   - Frontend: route files compose, feature hooks fetch/mutate, components present
2. Apply **Open/Closed**: extend by adding, not by editing scattered switches. Register cron jobs in `CRON_JOBS`, add message builders, add `cva` variants, and add conversation-state handlers to the transition table.
3. Apply **Liskov Substitution**: every implementation of a port behaves identically (same `AppError` codes, ordering, idempotency, nullability). In-memory fakes honour the real contract. When a fake and the real implementation disagree, fix the fake.
4. Apply **Interface Segregation**: keep ports and props small. `BookingService` and `NotificationService` are separate on purpose. Components take the fields they render. Several mutually exclusive boolean props mean it should be a `variant`.
5. Apply **Dependency Inversion**: domain code depends on ports ([packages/features/ports.ts](/packages/features/ports.ts), repository interfaces), never on `supabase-js`, `fetch` or Clerk directly. Wire implementations only in [container.ts](/apps/api/src/container.ts) or app providers.
6. Prefer YAGNI to speculative abstraction. Add an interface only for a real boundary or a second implementation (a test fake counts).
7. Use composition over inheritance. No class hierarchies in React.
8. Keep a pure core and a thin shell. Availability, conversation transitions, calendar layout and formatting are pure functions with injected `now`/timezone/ID generators.
9. Keep units small: files ≲ 300 lines, functions ≲ 40 lines, ≤ 4 parameters (use an options object beyond that), nesting ≤ 3.
10. Use strict TypeScript: no `any` (use `unknown` + narrowing), no unexplained `!`. Validate external input with zod at the boundary and trust types inside.
11. Name things for what they are (`listAvailableSlots`, not `getData`). Booleans read as questions (`isActive`). Comments explain why, not what. Delete dead code in the same change.

## Examples

### Example 1 - Dependency Inversion

```typescript
// ✅ DO: depend on the port, inject the implementation
export function createReminderJob(deps: { booking: BookingService; clock: () => Date }) { … }

// ❌ DON'T: reach for concrete clients inside domain logic
import { createClient } from '@supabase/supabase-js';
export async function sendReminders() { const db = createClient(URL, KEY); … }
```

### Example 2 - Single Responsibility In Routes

```typescript
// ✅ DO: the handler parses, delegates, responds
v1.post('/appointments', async (c) => {
  const body = await parseJson(c, CreateAppointmentSchema);
  const appointment = await c.get('container').booking.createAppointment(toInput(c, body));
  return c.json({ data: appointment }, 201);
});

// ❌ DON'T: availability maths and SQL inside the handler
v1.post('/appointments', async (c) => { const rules = await db.from('availability_rules')…; for (…) { … } });
```
