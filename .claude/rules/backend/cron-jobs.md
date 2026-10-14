---
paths: apps/api/src/routes/cron.ts,apps/api/src/**/jobs.ts,packages/database/supabase/migrations/*cron*.sql
description: Rules for scheduled jobs triggered by pg_cron via pg_net
---

# Cron Jobs

Scheduled work (reminders, conversation expiry, WABA health, token refresh, cleanup) runs as idempotent jobs behind `/cron/<job>`, called by pg_cron through pg_net with `x-cron-secret`.

## Implementation

1. Register a job in `CRON_JOBS` in [cron.ts](/apps/api/src/routes/cron.ts) as `(container, now?) => Promise<Record<string, number>>` and return counts.
2. Make jobs idempotent and safe to overlap. Claim work atomically in SQL (e.g. `claim_due_reminders`) before side effects.
3. Bound each run (`limit`) so it finishes well within the function timeout.
4. Inject `now` so jobs are testable, and test the claim/sent/failed transitions.
5. Add the schedule in a guarded cron migration and document it in [database.md](/docs/database.md).

## Examples

```typescript
// ✅ DO
const claimed = await db.rpc('claim_due_reminders', {
  p_now: now.toISOString(),
  p_limit: 100,
});

// ❌ DON'T: select then send without claiming (two runs double-send)
const due = await db.from('appointments').select('*').lte('starts_at', soon);
```
