---
paths: apps/api/**/*.ts,apps/api/package.json,apps/api/tsconfig.json,packages/features/**/*.ts,packages/companion/**/*.ts,packages/app-store/**/*.ts,packages/testing/**/*.ts,.dependency-cruiser.cjs,tsconfig.depcruise.json
description: Core rules for the Hono TypeScript backend on Supabase Edge Functions (layering, errors, env, runtime, logging)
---

# Backend

Guidelines for the API shell in `apps/api/` and the domain packages it composes (`packages/features`, `packages/companion`, `packages/app-store`, `packages/testing`): one runtime-agnostic Hono app, served by the Supabase Edge Function `api` (Deno) and tested under Node/Vitest. Where code goes and the package dependency rules are in [repository-structure.md](/.claude/rules/general/repository-structure.md). Topic rules in this folder cover endpoints, services, repositories, migrations, integrations, the WhatsApp engine, tests and cron jobs.

## Implementation

1. Respect the layers: `apps/api` `routes/` (HTTP) → services in `packages/features/<feature>/services` (and `packages/app-store`, `packages/companion`) → repositories → `db`. Dependencies arrive through [container.ts](/apps/api/src/container.ts). Services never import Hono or `apps/api`.
2. Throw `AppError` (or `notFound`, `forbidden`, `ruleViolation`) for expected failures, and map database errors with `unwrap`/`mapDbError`. Never build error JSON by hand; [common.ts](/apps/api/src/middleware/common.ts) renders the envelope.
3. Log with `c.get('logger')` (or an injected logger) using structured fields. Never log PII or tokens.
4. Add env vars to [env.ts](/apps/api/src/env.ts) and `apps/api/.env.example`. Call `requireEnv` at the point of use for feature-specific ones. A package that reads env takes a small structural type of just those keys (`WhatsAppEnv`) instead of importing `Env`.
5. Keep the code runtime-agnostic: Web APIs, `node:` builtins and the pinned npm deps only. No filesystem access at runtime; import bundled JSON with `with { type: 'json' }`. Write relative imports with explicit `.ts` extensions (`npm run fix:imports` fixes them). Import another package as `@booking/<package>/<path>.ts`; within a package use relative paths.
6. Keep the backend deterministic: inject `now` and ID generators into domain code.
7. Run `cd apps/api && npx tsc --noEmit && npx vitest run && npm run check:edge && npm run test:edge`, then `npm run check:boundaries && npm run check:imports` from the repo root, before calling backend work done.
8. Add a dependency to both `apps/api/package.json` and `packages/database/supabase/functions/api/deno.json` at the same exact version, at least a day old (Deno blocks newer releases). Packages resolve npm imports through `apps/api`, so declare the dependency there.

## Examples

```typescript
// ✅ DO
if (!service.is_active)
  throw ruleViolation('SERVICE_INACTIVE', 'This service is no longer offered');

// ❌ DON'T
return c.json({ ok: false, msg: 'inactive' }, 400);
```
