---
paths: packages/database/supabase/functions/**,packages/database/supabase/config.toml,apps/mobile/eas.json,apps/mobile/app.json,.github/**,**/.env.example,.mcp.json
description: Environments, deployments, CI and configuration for Supabase (DB + Edge Functions), EAS and GitHub
---

# Infrastructure

The system runs on managed services: Supabase (database, Edge Functions for the API, Realtime, Storage, cron), Clerk (identity), Meta (WhatsApp) and EAS (app builds/updates). There are no servers to operate.

## Implementation

1. Keep environments separate: dev and prod Supabase projects, Clerk instances, a Meta test number for dev, and EAS `preview` vs `production` channels.
2. Add every new variable to `apps/mobile/src/lib/env.ts` or `apps/api/src/env.ts` (zod-validated) and the matching `.env.example`. App variables must start with `EXPO_PUBLIC_` and never contain secrets.
3. Keep the API a single Edge Function (`api`): [index.ts](/packages/database/supabase/functions/api/index.ts) mounts `apps/api/src/app.ts` under `/api`, with `verify_jwt = false` in `config.toml` because the API authenticates itself. Deploy with `supabase --workdir packages/database functions deploy api` and set secrets with `supabase secrets set`.
4. Schedule jobs with pg_cron → pg_net → `/cron/<job>` using the `x-cron-secret` header. The URL and secret live in Supabase Vault, never in migrations.
5. Apply schema changes only through migrations (`supabase --workdir packages/database db push` to dev first). Never change a hosted database by hand.
6. Keep CI gating PRs on app lint/typecheck/tests, backend typecheck/tests and `scripts/db/test.sh`.
7. Add MCP servers to [.mcp.json](/.mcp.json) with `${VAR}` expansion only. Document them in [mcp.md](/docs/mcp.md).

## Examples

```jsonc
// ✅ DO: env expansion in .mcp.json
"env": { "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}" }

// ❌ DON'T: a literal token
"env": { "SUPABASE_ACCESS_TOKEN": "sbp_12ab…" }
```
