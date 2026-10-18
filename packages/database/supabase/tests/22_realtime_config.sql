-- Schedule-config tables are published to Realtime and RLS-scoped per business.
begin;

do $$
declare
  t text;
begin
  foreach t in array array[
    'business_hours', 'business_special_days', 'availability_rules',
    'availability_overrides', 'staff_breaks', 'staff_time_off'
  ]
  loop
    perform tests.ok((select relrowsecurity from pg_class where oid = format('public.%I', t)::regclass),
      t || ' has RLS enabled');
    perform tests.eq((select count(*) from pg_policies
                       where schemaname = 'public' and tablename = t
                         and policyname = 'members_select' and cmd = 'SELECT' and roles = '{authenticated}')::int,
      1, t || ' has a members_select policy for authenticated');
    perform tests.ok(
      coalesce((select puballtables from pg_publication where pubname = 'supabase_realtime'), false)
      or exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t),
      t || ' is in the supabase_realtime publication');
  end loop;
end
$$;

rollback;
