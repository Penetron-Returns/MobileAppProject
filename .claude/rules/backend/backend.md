---
paths: backend/**/*.ts,backend/package.json,backend/tsconfig.json
description: Core rules for the Hono/Vercel TypeScript backend (layering, errors, env, logging)
---

# Backend

Guidelines for the API in `backend/`: one Hono app deployed as a single Vercel function. Topic rules in this folder cover endpoints, services, repositories, migrations, integrations, the WhatsApp engine, tests and cron jobs.

## Implementation

1. Respect the layers: `routes/` (HTTP) → services (`booking/`, `whatsapp/`, `notifications/`) → repositories → `db`. Dependencies arrive through [container.ts](/backend/src/container.ts). Services never import Hono.
2. Throw `AppError` (or `notFound`, `forbidden`, `ruleViolation`) for expected failures, and map database errors with `unwrap`/`mapDbError`. Never build error JSON by hand; [common.ts](/backend/src/middleware/common.ts) renders the envelope.
3. Log with `c.get('logger')` (or an injected logger) using structured fields. Never log PII or tokens.
4. Add env vars to [env.ts](/backend/src/env.ts) and `backend/.env.example`. Call `requireEnv` at the point of use for feature-specific ones.
5. Keep cold starts small: avoid heavy top-level imports that aren't needed on every request.
6. Keep the backend deterministic: inject `now` and ID generators into domain code.
7. Run `cd backend && npx tsc --noEmit && npx vitest run` before calling backend work done.

## Examples

```typescript
// ✅ DO
if (!service.is_active) throw ruleViolation('SERVICE_INACTIVE', 'This service is no longer offered');

// ❌ DON'T
return c.json({ ok: false, msg: 'inactive' }, 400);
```
