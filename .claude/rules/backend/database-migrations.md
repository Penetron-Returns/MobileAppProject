---
paths: supabase/**,scripts/db/**,packages/shared/database.types.ts
description: Rules for Supabase migrations, RLS, RPCs, SQL tests and generated types
---

# Database Migrations

The schema is defined only by migrations in `supabase/migrations/` and verified by SQL tests. See [database.md](/docs/database.md).

## Implementation

1. Treat migrations as append-only. Never edit a merged migration (the Edit hook blocks it); write a new `YYYYMMDDHHMMSS_<what>.sql`.
2. Give every business-owned table a `business_id` FK (cascade from `businesses`), composite `(business_id, id)` FKs for cross-table references, RLS with a business-scoped SELECT policy for `authenticated`, no write policies, an `updated_at` trigger if mutable, and the audit trigger for configuration data.
3. Enforce invariants in the database (checks, uniques, exclusion constraints), not only in TypeScript.
4. Write RPCs with `set search_path = ''` and fully-qualified names. Raise `23P01`, `P0002`, or `P0001` with `RULE:<CODE>:<message>`. Grant EXECUTE deliberately.
5. Run `scripts/db/gen-types.sh` after every schema change and commit `packages/shared/database.types.ts`.
6. Add assertions to `supabase/tests/*.sql` for every schema or RPC change, and keep `scripts/db/test.sh` green.
7. Keep seed data realistic and relative to `now()`.
8. Use the `supabase-postgres-best-practices` skill before writing SQL.

## Examples

```sql
-- ✅ DO: new table with scoping, RLS and audit
create table public.gift_vouchers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  …, unique (business_id, id)
);
alter table public.gift_vouchers enable row level security;
create policy gift_vouchers_select on public.gift_vouchers for select to authenticated
  using (business_id = private.current_business_id());

-- ❌ DON'T: edit 20260924000002_tables.sql after merge, or skip RLS
```
