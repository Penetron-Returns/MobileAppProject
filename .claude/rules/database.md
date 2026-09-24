---
paths:
  - "supabase/**"
  - "scripts/db/**"
  - "shared/database.types.ts"
---

# Database (Supabase Postgres)

- Migrations are **append-only**. Never edit a migration that has been merged; write a new one. Name them `YYYYMMDDHHMMSS_<what>.sql`.
- After any schema change, run `scripts/db/gen-types.sh` and commit `shared/database.types.ts`. `scripts/db/test.sh` fails if the types are stale. Never hand-edit the types file.
- Every new table: `business_id` FK (cascade from `businesses`), composite `(business_id, id)` FKs for cross-table references, RLS enabled, a business-scoped SELECT policy for `authenticated`, no write policies, an `updated_at` trigger if mutable, and the audit trigger if it's configuration data.
- Enforce invariants in the database (constraints, exclusion, checks, unique keys), not only in TypeScript.
- RPCs: `set search_path = ''`, fully qualified names, errors via SQLSTATE conventions (`23P01`, `P0002`, `P0001` with `RULE:<CODE>:<message>`), and EXECUTE granted deliberately.
- Every schema or RPC change gets assertions in `supabase/tests/*.sql`. `scripts/db/test.sh` must be green.
- Seed data stays realistic and relative to `now()` so the demo never goes stale.
