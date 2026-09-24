---
description: Testing conventions for app, backend and database (always loaded)
---

# Testing

Tests prove behaviour and keep the deterministic promise honest. Every behaviour change ships with tests in the same change.

## Implementation

1. Start bug fixes with a failing test.
2. Use table-driven unit tests for pure logic (availability, transitions, calendar layout, formatting, parsing), and cover the edges: DST, midnight, empty input, limits.
3. Inject clocks, timezones and ID generators. No real time, randomness or sleeps.
4. Use fakes through ports (in-memory repositories, fake Graph client, fake `BookingService`) instead of mocking module internals.
5. Test routes through `createApp({ getContainer, verifyToken, idempotencyStore })` with [helpers.ts](/apps/backend/test/helpers.ts).
6. Test constraints, RLS and RPCs in `supabase/tests/*.sql` via `scripts/db/test.sh`, never only through mocks.
7. Never skip, disable or loosen a test to get green.
8. Name tests after the behaviour they check.

## Examples

```typescript
// ✅ DO
it('rejects a second booking that overlaps the buffer of the first', …);

// ❌ DON'T
it('works', …); it.skip('flaky slot test', …);
```
