---
paths:
  - "backend/**/*.ts"
---

# Backend (Hono on Vercel)

- Route modules export a `Hono<AppEnv>` and are mounted in `src/app.ts`. Auth (`requireAuth`), idempotency and CORS are applied there, not per route.
- Handler shape: parse with `parseJson`/`parseQuery`/`parseParam` + zod v4 schema → call a service → `c.json({ data }, status)`. No business rules in handlers.
- Get dependencies from `c.get('container')`, never by importing singletons. Scope everything by `c.get('auth').businessId`.
- Errors: throw `AppError` (or helpers `notFound`, `forbidden`, `ruleViolation`). Map DB errors with `unwrap`/`mapDbError`. Never return ad-hoc error JSON; the envelope comes from `errorHandler`.
- Supabase access: typed `Db` (`SupabaseClient<Database>`). Keep table names literal/generic (`keyof Database['public']['Tables']`), never `string`, so queries stay type-checked. Cast jsonb payloads to `Json` at the edge.
- Pass `actor.id ?? ''` as `p_actor_id` to RPCs. Load a row scoped by `business_id` before calling id-only RPCs.
- Logging: `c.get('logger')` with structured fields. Never log PII or tokens.
- New env vars: add to `src/env.ts` (zod) and `backend/.env.example`. Use `requireEnv` at the point of use for feature-specific ones.
- Keep the function cold-start small: no heavy imports at module top level that aren't needed on every request.
