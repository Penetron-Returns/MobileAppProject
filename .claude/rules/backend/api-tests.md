---
paths: backend/test/**/*.ts,backend/src/**/*.test.ts
description: Rules for backend Vitest tests (routes, services, engines, fakes)
---

# API Tests

Backend tests run with Vitest and never touch real services. They prove behaviour through the public surface: routes, services and pure engines.

## Implementation

1. Test routes through `createApp({ getContainer, verifyToken, idempotencyStore })` with `testContainer()` and `memoryIdempotencyStore()` from [helpers.ts](/backend/test/helpers.ts).
2. Test services against in-memory repositories and fake clients injected through ports.
3. Write table-driven tests for pure engines (availability, transitions, ID grammar), with fixed clocks and timezones including a DST zone.
4. Assert the error envelope (`error.code`, status) for failure paths, not just the happy path.
5. Test webhooks with real signatures computed in the test (HMAC / svix) and a duplicate delivery.
6. Place tests in `backend/test/<module>/` and name them after behaviour.

## Examples

```typescript
// ✅ DO
it('replays the stored response for a repeated Idempotency-Key', async () => { … });

// ❌ DON'T: hit the network or depend on wall-clock time
const res = await fetch('https://graph.facebook.com/…'); expect(new Date().getHours()).toBe(9);
```
