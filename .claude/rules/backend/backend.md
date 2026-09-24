---
paths: apps/backend/**/*.ts,apps/backend/package.json,apps/backend/tsconfig.json
description: Core rules for the Hono TypeScript backend on Supabase Edge Functions (layering, errors, env, runtime, logging)
---

# Backend

Guidelines for the API in `apps/backend/`: one runtime-agnostic Hono app, served by the Supabase Edge Function `api` (Deno) and tested under Node/Vitest. Topic rules in this folder cover endpoints, services, repositories, migrations, integrations, the WhatsApp engine, tests and cron jobs.

## Implementation

1. Respect the layers: `routes/` (HTTP) → services (`booking/`, `whatsapp/`, `notifications/`) → repositories → `db`. Dependencies arrive through [container.ts](/apps/backend/src/container.ts). Services never import Hono.
2. Throw `AppError` (or `notFound`, `forbidden`, `ruleViolation`) for expected failures, and map database errors with `unwrap`/`mapDbError`. Never build error JSON by hand; [common.ts](/apps/backend/src/middleware/common.ts) renders the envelope.
3. Log with `c.get('logger')` (or an injected logger) using structured fields. Never log PII or tokens.
4. Add env vars to [env.ts](/apps/backend/src/env.ts) and `apps/backend/.env.example`. Call `requireEnv` at the point of use for feature-specific ones.
5. Keep the code runtime-agnostic: Web APIs, `node:` builtins and the pinned npm deps only. No filesystem access at runtime; import bundled JSON with `with { type: 'json' }`. Write relative imports with explicit `.ts` extensions (`npm run fix:imports` fixes them).
6. Keep the backend deterministic: inject `now` and ID generators into domain code.
7. Run `cd apps/backend && npx tsc --noEmit && npx vitest run && npm run check:edge && npm run test:edge` before calling backend work done.
8. Add a dependency to both `apps/backend/package.json` and `supabase/functions/api/deno.json` at the same exact version, at least a day old (Deno blocks newer releases).

## Examples

```typescript
// ✅ DO
if (!service.is_active) throw ruleViolation('SERVICE_INACTIVE', 'This service is no longer offered');

// ❌ DON'T
return c.json({ ok: false, msg: 'inactive' }, 400);
```
