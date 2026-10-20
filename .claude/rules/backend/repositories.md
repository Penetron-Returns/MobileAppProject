---
paths: packages/features/repositories/**/*.ts,packages/features/lib/db.ts,apps/api/src/lib/db.ts,packages/app-store/**/supabaseRepo.ts,packages/testing/**/*epository*.ts
description: Rules for Supabase repositories, typed queries, business scoping and RPC calls
---

# Repositories

Repositories are the only backend code that talks to Supabase. They use the typed service-role client, so every query must scope itself.

## Implementation

1. Define a repository interface and a Supabase implementation, plus an in-memory fake in `packages/testing` when tests need one. The booking schema's interfaces are in `packages/features/repositories/types.ts` and the implementation in `supabase.ts`; an app-store app keeps its own (`app-store/whatsapp/supabaseRepo.ts`). The client is created in `apps/api/src/lib/db.ts` and passed in; packages only know the `Db` type from `packages/features/lib/db.ts`.
2. Filter every query by `business_id` explicitly. The service role bypasses RLS.
3. Keep table names typed: helpers take `T extends keyof Database['public']['Tables']`, never `string`. Cast jsonb payloads to `Json` at this edge.
4. Filter and order appointments by the generated `starts_at`/`ends_at` columns. Use range operators (`ov`) on `blocked` for overlap queries.
5. Call RPCs by parameter name. Pass `actor.id ?? ''` for `p_actor_id` and omit nullable optionals rather than sending `null`. Load the row scoped by `business_id` before calling an id-only RPC.
6. Map rows to `packages/types/api.ts` DTOs in one mapper per entity.

## Examples

```typescript
// ✅ DO
const t = <T extends TableName>(table: T) => db.from(table);
await t('clients')
  .select(CLIENT_COLS)
  .eq('business_id', businessId)
  .eq('id', clientId)
  .maybeSingle();

// ❌ DON'T
const t = (table: string) => db.from(table); // loses all typing
await db.from('clients').select('*').eq('id', clientId); // not business-scoped
```
