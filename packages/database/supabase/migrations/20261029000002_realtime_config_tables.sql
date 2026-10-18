-- =============================================================================
-- Realtime for the schedule-config tables, so the calendar's visible hours update
-- live when hours change on another device. Guarded like 20260924000006 so plain
-- Postgres still migrates and re-runs are no-ops. Every table already has RLS and a
-- business-scoped `members_select` policy for authenticated (20260924000004,
-- 20261018000001), which Realtime applies per subscriber.
-- =============================================================================
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publication supabase_realtime not found; skipping realtime setup';
    return;
  end if;
  if (select puballtables from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  foreach t in array array[
    'business_hours', 'business_special_days', 'availability_rules',
    'availability_overrides', 'staff_breaks', 'staff_time_off'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
