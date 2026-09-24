---
paths: backend/src/routes/**/*.ts,backend/src/app.ts
description: Rules for Hono route modules, validation, auth, idempotency and response envelopes
---

# API Endpoints

Route modules translate HTTP to service calls. They are thin, validated and business-scoped. The contract lives in [BUILD_PLAN.md](/docs/BUILD_PLAN.md) §4 and [api.ts](/shared/api.ts).

## Implementation

1. Export a `Hono<AppEnv>` per module and mount it in [app.ts](/backend/src/app.ts). Auth (`requireAuth`), idempotency and CORS are applied there, not per route.
2. Parse input with `parseJson`, `parseQuery` and `parseParam` using zod v4 schemas that match `shared/api.ts`.
3. Scope everything by `c.get('auth').businessId`. Add `requireOwner` to owner-only routes.
4. Call exactly one service method per handler where possible, then return `c.json({ data }, status)` (201 for creates).
5. Require `Idempotency-Key` on every mutating `/v1/**` and `/public/**` route (the middleware does this). Never bypass it.
6. Add a new route to BUILD_PLAN §4 and `shared/api.ts` in the same PR.

## Examples

```typescript
// ✅ DO
catalog.patch('/services/:id', requireOwner, async (c) => {
  const id = parseParam(c, 'id', z.uuid());
  const body = await parseJson(c, UpdateServiceSchema);
  const service = await catalogService(c).updateService(c.get('auth').businessId, id, body);
  return c.json({ data: service });
});

// ❌ DON'T: unvalidated input, no business scoping
catalog.patch('/services/:id', async (c) => {
  await db.from('services').update(await c.req.json()).eq('id', c.req.param('id'));
});
```
