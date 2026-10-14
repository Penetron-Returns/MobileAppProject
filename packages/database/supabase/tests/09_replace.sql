-- replace_business_hours / replace_staff_availability / replace_staff_services
begin;

create temporary table f on commit drop as select tests.fixture('org_replace') as v;
create temporary table g on commit drop as select tests.fixture('org_replace_other') as v;

do $$
declare
  f jsonb := (select v from f);
  g jsonb := (select v from g);
  b uuid := (f->>'business')::uuid;
  v_keep uuid;
  v_n int;
begin
  -- business hours
  select count(*) into v_n from public.replace_business_hours(b, '[
    {"weekday": 1, "opens_at": "09:00", "closes_at": "13:00"},
    {"weekday": 1, "opens_at": "14:00", "closes_at": "18:00"},
    {"weekday": 6, "opens_at": "09:00", "closes_at": "14:00"}]');
  perform tests.eq(v_n, 3, 'replace_business_hours returns the new rows');
  select id into v_keep from public.business_hours where business_id = b and weekday = 1 and opens_at = '09:00';

  select count(*) into v_n from public.replace_business_hours(b, '[
    {"weekday": 1, "opens_at": "09:00", "closes_at": "13:00"},
    {"weekday": 2, "opens_at": "09:00:00", "closes_at": "17:30"},
    {"weekday": 2, "opens_at": "09:00", "closes_at": "17:30"}]');
  perform tests.eq(v_n, 2, 'full replace (duplicates collapsed)');
  perform tests.eq((select count(*) from public.business_hours where business_id = b and weekday = 6)::int, 0, 'removed days are gone');
  perform tests.ok(exists (select 1 from public.business_hours where id = v_keep), 'unchanged rows keep their id');

  perform tests.throws(format($q$select public.replace_business_hours(%L, '[{"weekday": 1, "opens_at": "09:00", "closes_at": "13:00"}, {"weekday": 1, "opens_at": "12:00", "closes_at": "15:00"}]')$q$, b),
    'P0001', 'RULE:OVERLAPPING_HOURS:%', 'overlapping hours rejected');
  perform tests.throws(format($q$select public.replace_business_hours(%L, '[{"weekday": 1, "opens_at": "13:00", "closes_at": "09:00"}]')$q$, b),
    'P0001', 'RULE:INVALID_HOURS:%', 'inverted hours rejected');
  perform tests.throws(format($q$select public.replace_business_hours(%L, '[{"weekday": 9, "opens_at": "09:00", "closes_at": "10:00"}]')$q$, b),
    'P0001', 'RULE:INVALID_HOURS:%', 'bad weekday rejected');
  perform tests.throws(format($q$select public.replace_business_hours(%L, '{"weekday": 1}')$q$, b),
    'P0001', 'RULE:INVALID_INPUT:%', 'non-array rejected');
  perform tests.throws(format($q$select public.replace_business_hours(%L, '[]')$q$, gen_random_uuid()),
    'P0002', 'business not found', 'unknown business → P0002');
  perform tests.eq((select count(*) from public.business_hours where business_id = b)::int, 2, 'failed replace leaves hours intact');

  select count(*) into v_n from public.replace_business_hours(b, '[]');
  perform tests.eq(v_n, 0, 'empty array closes every day');

  -- staff availability
  select count(*) into v_n from public.replace_staff_availability((f->>'staff_a')::uuid,
    '[{"weekday": 2, "start_time": "09:00", "end_time": "17:00"}, {"weekday": 3, "start_time": "10:00", "end_time": "12:00"}]');
  perform tests.eq(v_n, 2, 'replace_staff_availability inserts rules');
  perform tests.eq((select business_id from public.availability_rules where staff_id = (f->>'staff_a')::uuid limit 1), b,
                   'rules get the staff''s business_id');
  select count(*) into v_n from public.replace_staff_availability((f->>'staff_a')::uuid,
    '[{"weekday": 3, "start_time": "10:00", "end_time": "12:00"}]');
  perform tests.eq(v_n, 1, 'replace_staff_availability replaces');
  perform tests.throws(format($q$select public.replace_staff_availability(%L, '[{"weekday": 3, "start_time": "10:00", "end_time": "12:00"}, {"weekday": 3, "start_time": "11:00", "end_time": "13:00"}]')$q$, f->>'staff_a'),
    'P0001', 'RULE:OVERLAPPING_HOURS:%', 'overlapping rules rejected');
  perform tests.throws($q$select public.replace_staff_availability(gen_random_uuid(), '[]')$q$,
    'P0002', 'staff not found', 'unknown staff → P0002');
  select count(*) into v_n from public.replace_staff_availability((f->>'staff_a')::uuid, '[]');
  perform tests.eq(v_n, 0, 'empty array → staff inherits business hours');

  -- staff services
  select count(*) into v_n from public.replace_staff_services((f->>'staff_b')::uuid,
    array[(f->>'service_long')::uuid, (f->>'service_short')::uuid, (f->>'service_short')::uuid]);
  perform tests.eq(v_n, 2, 'replace_staff_services sets the list (deduplicated)');
  select count(*) into v_n from public.replace_staff_services((f->>'staff_b')::uuid, array[(f->>'service_short')::uuid]);
  perform tests.eq(v_n, 1, 'replace_staff_services removes unlisted services');
  perform tests.throws(format($q$select public.replace_staff_services(%L, array[%L]::uuid[])$q$, f->>'staff_b', g->>'service_long'),
    'P0002', 'service not found', 'service of another business → P0002');
  perform tests.eq((select count(*) from public.staff_services where staff_id = (f->>'staff_b')::uuid)::int, 1,
                   'failed replace leaves services intact');
  select count(*) into v_n from public.replace_staff_services((f->>'staff_b')::uuid, '{}');
  perform tests.eq(v_n, 0, 'empty array removes all');
  select count(*) into v_n from public.replace_staff_services((f->>'staff_b')::uuid, null);
  perform tests.eq(v_n, 0, 'null behaves like empty');
end
$$;

rollback;
