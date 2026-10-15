-- Availability model: special days, staff breaks, staff time off, one range per weekday,
-- the split-day conversion, the replace functions, RLS and audit.
begin;

create temporary table f on commit drop as select tests.fixture('org_avail_a') as v;
create temporary table g on commit drop as select tests.fixture('org_avail_b') as v;

-- ------------------------------------------------------------ constraints
do $$
declare
  f jsonb := (select v from f);
  b uuid := (f->>'business')::uuid;
  sa uuid := (f->>'staff_a')::uuid;
begin
  -- special days
  insert into public.business_special_days (business_id, date, name, kind) values (b, '2031-12-25', 'Christmas Day', 'public_holiday');
  perform tests.throws(format($q$insert into public.business_special_days (business_id, date, name, kind) values (%L, '2031-12-25', 'Dup', 'closure')$q$, b),
    '23505', null, 'one special day per date');
  perform tests.throws(format($q$insert into public.business_special_days (business_id, date, name, kind, is_closed, start_time, end_time) values (%L, '2031-12-26', 'x', 'closure', true, '09:00', '12:00')$q$, b),
    '23514', null, 'a closed special day carries no hours');
  perform tests.throws(format($q$insert into public.business_special_days (business_id, date, name, kind, is_closed) values (%L, '2031-12-26', 'x', 'special_hours', false)$q$, b),
    '23514', null, 'an open special day needs hours');
  perform tests.throws(format($q$insert into public.business_special_days (business_id, date, name, kind, is_closed, start_time, end_time) values (%L, '2031-12-26', 'x', 'special_hours', false, '12:00', '09:00')$q$, b),
    '23514', null, 'special hours end after start');
  perform tests.throws(format($q$insert into public.business_special_days (business_id, date, name, kind, is_closed, start_time, end_time) values (%L, '2031-12-26', 'x', 'closure', false, '09:00', '12:00')$q$, b),
    '23514', null, 'a closure must be closed');
  perform tests.throws(format($q$insert into public.business_special_days (business_id, date, name, kind) values (%L, '2031-12-26', 'x', 'special_hours')$q$, b),
    '23514', null, 'special hours cannot be closed');
  perform tests.throws(format($q$insert into public.business_special_days (business_id, date, name, kind) values (%L, '2031-12-26', '  ', 'closure')$q$, b),
    '23514', null, 'a special day needs a name');
  insert into public.business_special_days (business_id, date, name, kind, is_closed, start_time, end_time)
    values (b, '2031-12-24', 'Christmas Eve', 'public_holiday', false, '09:00', '24:00');

  -- breaks
  insert into public.staff_breaks (business_id, staff_id, label, start_time, end_time, weekdays) values (b, sa, 'Lunch', '12:00', '13:00', '{1,2,3}');
  insert into public.staff_breaks (business_id, staff_id, label, start_time, end_time, weekdays) values (b, sa, 'Lunch', '12:00', '13:00', '{4,5}');
  perform tests.eq((select count(*) from public.staff_breaks where staff_id = sa::uuid)::int, 2, 'the same window on disjoint weekdays is allowed');
  perform tests.throws(format($q$insert into public.staff_breaks (business_id, staff_id, start_time, end_time, weekdays) values (%L, %L, '12:30', '14:00', '{3}')$q$, b, sa),
    'P0001', 'RULE:OVERLAPPING_BREAKS:%', 'overlapping breaks on a shared weekday rejected');
  perform tests.throws(format($q$insert into public.staff_breaks (business_id, staff_id, start_time, end_time) values (%L, %L, '12:30', '14:00')$q$, b, sa),
    'P0001', 'RULE:OVERLAPPING_BREAKS:%', 'an every-day break overlaps any weekday');
  insert into public.staff_breaks (business_id, staff_id, label, start_time, end_time, weekdays) values (b, sa, 'Tea', '13:00', '13:15', '{3}');
  perform tests.ok(true, 'touching breaks do not overlap');
  perform tests.throws(format($q$update public.staff_breaks set start_time = '12:30' where staff_id = %L and label = 'Tea'$q$, sa),
    'P0001', 'RULE:OVERLAPPING_BREAKS:%', 'overlap is also checked on update') ;
  perform tests.throws(format($q$insert into public.staff_breaks (business_id, staff_id, start_time, end_time) values (%L, %L, '15:00', '15:00')$q$, b, sa),
    '23514', null, 'break end must be after start');
  perform tests.throws(format($q$insert into public.staff_breaks (business_id, staff_id, start_time, end_time, weekdays) values (%L, %L, '15:00', '16:00', '{7}')$q$, b, sa),
    '23514', null, 'break weekdays 0..6');
  perform tests.throws(format($q$insert into public.staff_breaks (business_id, staff_id, label, start_time, end_time) values (%L, %L, '', '15:00', '16:00')$q$, b, sa),
    '23514', null, 'break needs a label');
  perform tests.eq((select weekdays from public.staff_breaks where label = 'Tea' and staff_id = sa::uuid), '{3}'::smallint[], 'weekdays stored');
  insert into public.staff_breaks (business_id, staff_id, label, start_time, end_time, weekdays)
    values (b, sa, 'Late', '16:00', '17:00', '{5,1,5}');
  perform tests.eq((select weekdays from public.staff_breaks where label = 'Late'), '{1,5}'::smallint[], 'weekdays are sorted and de-duplicated');

  -- time off
  insert into public.staff_time_off (business_id, staff_id, starts_on, ends_on, reason) values (b, sa, '2031-07-01', '2031-07-05', 'leave');
  insert into public.staff_time_off (business_id, staff_id, starts_on, ends_on, start_time, end_time, reason, note)
    values (b, sa, '2031-08-01', '2031-08-01', '14:00', '24:00', 'training', 'Course');
  perform tests.throws(format($q$insert into public.staff_time_off (business_id, staff_id, starts_on, ends_on) values (%L, %L, '2031-07-05', '2031-07-01')$q$, b, sa),
    '23514', null, 'time off ends_on >= starts_on');
  perform tests.throws(format($q$insert into public.staff_time_off (business_id, staff_id, starts_on, ends_on, start_time) values (%L, %L, '2031-07-01', '2031-07-01', '09:00')$q$, b, sa),
    '23514', null, 'partial time off needs both times');
  perform tests.throws(format($q$insert into public.staff_time_off (business_id, staff_id, starts_on, ends_on, start_time, end_time) values (%L, %L, '2031-07-01', '2031-07-01', '12:00', '09:00')$q$, b, sa),
    '23514', null, 'partial time off end after start');
  perform tests.throws(format($q$insert into public.staff_time_off (business_id, staff_id, starts_on, ends_on) values (%L, %L, '2031-01-01', '2033-01-01')$q$, b, sa),
    '23514', null, 'time off is capped at 366 days');
  perform tests.throws(format($q$insert into public.staff_time_off (business_id, staff_id, starts_on, ends_on, reason) values (%L, %L, '2031-07-01', '2031-07-01', 'holiday')$q$, b, sa),
    '22P02', null, 'time off reason is an enum');
  perform tests.throws(format($q$insert into public.staff_time_off (business_id, staff_id, starts_on, ends_on) values (%L, %L, '2031-07-01', '2031-07-01')$q$, b, (select v->>'staff_a' from g)),
    '23503', null, 'time off staff must belong to the business');

  -- one range per weekday
  insert into public.business_hours (business_id, weekday, opens_at, closes_at) values (b, 1, '09:00', '17:00');
  perform tests.throws(format($q$insert into public.business_hours (business_id, weekday, opens_at, closes_at) values (%L, 1, '18:00', '20:00')$q$, b),
    '23505', null, 'one business-hours row per weekday');
  insert into public.availability_rules (business_id, staff_id, weekday, start_time, end_time) values (b, sa, 1, '09:00', '12:00');
  perform tests.throws(format($q$insert into public.availability_rules (business_id, staff_id, weekday, start_time, end_time) values (%L, %L, 1, '13:00', '17:00')$q$, b, sa),
    '23505', null, 'one availability rule per staff and weekday');
  perform tests.throws(format($q$insert into public.availability_overrides (business_id, date, is_closed) values (%L, '2031-12-25', true)$q$, b),
    '23502', null, 'overrides are per staff member now');
end
$$;

-- ------------------------------------------------------------ audit
do $$
declare
  f jsonb := (select v from f);
  b uuid := (f->>'business')::uuid;
  v_id uuid := (select id from public.business_special_days where business_id = b and date = '2031-12-25');
begin
  perform tests.ok(exists (select 1 from public.audit_log where entity = 'business_special_days' and entity_id = v_id::text and action = 'insert' and business_id = b),
    'special day insert audited');
  update public.business_special_days set name = 'Christmas' where id = v_id;
  perform tests.eq((select diff -> 'name' ->> 'new' from public.audit_log where entity = 'business_special_days' and entity_id = v_id::text and action = 'update'),
    'Christmas', 'special day update audited with a diff');
  delete from public.business_special_days where id = v_id;
  perform tests.ok(exists (select 1 from public.audit_log where entity = 'business_special_days' and entity_id = v_id::text and action = 'delete'),
    'special day delete audited');
  perform tests.ok(exists (select 1 from public.audit_log where entity = 'staff_breaks' and action = 'insert' and business_id = b),
    'staff break audited');
  perform tests.ok(exists (select 1 from public.audit_log where entity = 'staff_time_off' and action = 'insert' and business_id = b),
    'staff time off audited');
end
$$;

-- ------------------------------------------------------------ RLS
select tests.as_member('{"sub": "user_a", "org_id": "org_avail_a"}');
do $$
begin
  perform tests.ok((select count(*) from public.staff_breaks) >= 3, 'member reads own breaks');
  perform tests.ok((select count(*) from public.staff_time_off) >= 2, 'member reads own time off');
  perform tests.ok((select count(*) from public.business_special_days) >= 1, 'member reads own special days');
  perform tests.throws($q$insert into public.staff_breaks (business_id, staff_id, start_time, end_time) select business_id, id, '10:00', '11:00' from public.staff limit 1$q$,
    '42501', null, 'members cannot write breaks');
  perform tests.throws($q$insert into public.staff_time_off (business_id, staff_id, starts_on, ends_on) select business_id, id, '2031-01-01', '2031-01-02' from public.staff limit 1$q$,
    '42501', null, 'members cannot write time off');
  perform tests.throws($q$insert into public.business_special_days (business_id, date, name, kind) select id, '2031-01-01', 'x', 'closure' from public.businesses limit 1$q$,
    '42501', null, 'members cannot write special days');
  perform tests.throws($q$select public.replace_staff_breaks(gen_random_uuid(), '[]')$q$, '42501', null, 'members cannot call replace_staff_breaks');
end
$$;
select tests.as_member('{"sub": "user_b", "org_id": "org_avail_b"}');
do $$
begin
  perform tests.eq((select count(*) from public.staff_breaks)::int, 0, 'another business sees none of the breaks');
  perform tests.eq((select count(*) from public.staff_time_off)::int, 0, 'another business sees none of the time off');
  perform tests.eq((select count(*) from public.business_special_days)::int, 0, 'another business sees none of the special days');
end
$$;
select tests.as_anon();
do $$
declare t text;
begin
  foreach t in array array['business_special_days', 'staff_breaks', 'staff_time_off'] loop
    perform tests.throws(format('select count(*) from public.%I', t), '42501', null, format('anon cannot read %s', t));
  end loop;
end
$$;
select tests.as_admin();

-- ------------------------------------------------------------ replace_staff_breaks
do $$
declare
  f jsonb := (select v from f);
  g jsonb := (select v from g);
  sb uuid := (f->>'staff_b')::uuid;
  v_keep uuid;
  v_n int;
begin
  select count(*) into v_n from public.replace_staff_breaks(sb, '[
    {"label": "Lunch", "start_time": "12:00", "end_time": "13:00", "weekdays": [3, 1, 3]},
    {"label": "  ", "start_time": "15:00", "end_time": "15:15"}]');
  perform tests.eq(v_n, 2, 'replace_staff_breaks inserts');
  perform tests.eq((select weekdays from public.staff_breaks where staff_id = sb and label = 'Lunch'), '{1,3}'::smallint[], 'weekdays normalised');
  perform tests.eq((select weekdays from public.staff_breaks where staff_id = sb and label = 'Break'), '{}'::smallint[], 'missing weekdays = every day, label defaults');
  perform tests.eq((select business_id from public.staff_breaks where staff_id = sb limit 1), (f->>'business')::uuid, 'breaks get the staff business_id');
  select id into v_keep from public.staff_breaks where staff_id = sb and label = 'Lunch';

  select count(*) into v_n from public.replace_staff_breaks(sb, '[
    {"label": "Lunch", "start_time": "12:00", "end_time": "13:00", "weekdays": [1, 3]},
    {"label": "Lunch", "start_time": "12:00", "end_time": "13:00", "weekdays": [1, 3]}]');
  perform tests.eq(v_n, 1, 'replace collapses duplicates and removes unlisted breaks');
  perform tests.ok(exists (select 1 from public.staff_breaks where id = v_keep), 'an unchanged break keeps its id');

  perform tests.throws(format($q$select public.replace_staff_breaks(%L, '[{"label": "A", "start_time": "12:00", "end_time": "13:00", "weekdays": [1]}, {"label": "B", "start_time": "12:30", "end_time": "14:00", "weekdays": [1, 2]}]')$q$, sb),
    'P0001', 'RULE:OVERLAPPING_BREAKS:%', 'overlapping breaks rejected');
  perform tests.throws(format($q$select public.replace_staff_breaks(%L, '[{"label": "A", "start_time": "12:00", "end_time": "13:00"}, {"label": "B", "start_time": "12:30", "end_time": "14:00", "weekdays": [6]}]')$q$, sb),
    'P0001', 'RULE:OVERLAPPING_BREAKS:%', 'an every-day break overlaps weekday breaks');
  perform tests.throws(format($q$select public.replace_staff_breaks(%L, '[{"label": "A", "start_time": "13:00", "end_time": "12:00"}]')$q$, sb),
    'P0001', 'RULE:INVALID_BREAK:%', 'inverted break rejected');
  perform tests.throws(format($q$select public.replace_staff_breaks(%L, '[{"label": "A", "start_time": "12:00", "end_time": "13:00", "weekdays": [8]}]')$q$, sb),
    'P0001', 'RULE:INVALID_BREAK:%', 'bad weekday rejected');
  perform tests.throws(format($q$select public.replace_staff_breaks(%L, '{"label": "A"}')$q$, sb),
    'P0001', 'RULE:INVALID_INPUT:%', 'non-array rejected');
  perform tests.throws($q$select public.replace_staff_breaks(gen_random_uuid(), '[]')$q$, 'P0002', 'staff not found', 'unknown staff → P0002');
  perform tests.eq((select count(*) from public.staff_breaks where staff_id = sb)::int, 1, 'a failed replace leaves breaks intact');
  perform tests.eq((select count(*) from public.staff_breaks where staff_id = (g->>'staff_a')::uuid)::int, 0, 'other businesses are untouched');

  select count(*) into v_n from public.replace_staff_breaks(sb, '[]');
  perform tests.eq(v_n, 0, 'empty array removes every break');
end
$$;

-- ------------------------------------------------------------ split-day conversion
-- Rebuild the old state (drop the new uniques, allow business-wide overrides), then convert.
drop index public.business_hours_business_weekday_key;
drop index public.availability_rules_staff_weekday_key;
alter table public.availability_overrides alter column staff_id drop not null;

do $$
declare
  h jsonb := tests.fixture('org_avail_conv');
  b uuid := (h->>'business')::uuid;
  sa uuid := (h->>'staff_a')::uuid;
  sb uuid := (h->>'staff_b')::uuid;
  v_breaks int;
begin
  -- Wednesday: business 09-12 + 13-17. staff_a works 09-11 + 14-17, staff_b inherits.
  insert into public.business_hours (business_id, weekday, opens_at, closes_at) values
    (b, 3, '09:00', '12:00'), (b, 3, '13:00', '17:00'), (b, 4, '08:00', '16:00');
  insert into public.availability_rules (business_id, staff_id, weekday, start_time, end_time) values
    (b, sa, 3, '09:00', '11:00'), (b, sa, 3, '14:00', '17:00'), (b, sa, 4, '08:00', '16:00');
  -- 2031-09-10: closed (reason becomes the name). 2031-09-11: open 10-12 + 14-16. 2031-09-12: closed row beats a window.
  insert into public.availability_overrides (business_id, staff_id, date, is_closed, reason) values
    (b, null, '2031-09-10', true, 'Inventory');
  insert into public.availability_overrides (business_id, staff_id, date, is_closed, start_time, end_time) values
    (b, null, '2031-09-11', false, '10:00', '12:00'), (b, null, '2031-09-11', false, '14:00', '16:00'),
    (b, null, '2031-09-12', false, '09:00', '10:00');
  insert into public.availability_overrides (business_id, staff_id, date, is_closed) values (b, null, '2031-09-12', true);
  -- a per-staff override is left alone
  insert into public.availability_overrides (business_id, staff_id, date, is_closed) values (b, sa, '2031-09-15', true);

  perform private.convert_split_availability();

  perform tests.eq((select count(*) from public.business_hours where business_id = b and weekday = 3)::int, 1, 'split business day becomes one row');
  perform tests.ok(exists (select 1 from public.business_hours where business_id = b and weekday = 3 and opens_at = '09:00' and closes_at = '17:00'),
    'business hours span earliest open to latest close');
  perform tests.eq((select count(*) from public.availability_rules where staff_id = sa and weekday = 3)::int, 1, 'split staff day becomes one row');
  perform tests.ok(exists (select 1 from public.availability_rules where staff_id = sa and weekday = 3 and start_time = '09:00' and end_time = '17:00'),
    'staff hours span first start to last end');
  perform tests.ok(exists (select 1 from public.staff_breaks where staff_id = sa and label = 'Lunch' and start_time = '11:00' and end_time = '14:00' and weekdays = '{3}'),
    'explicit-rule staff: the gap becomes a Lunch break (11:00-14:00, Wednesday)');
  perform tests.ok(exists (select 1 from public.staff_breaks where staff_id = sb and label = 'Lunch' and start_time = '12:00' and end_time = '13:00' and weekdays = '{3}'),
    'inheriting staff: the business gap becomes a Lunch break (12:00-13:00)');
  perform tests.eq((select count(*) from public.staff_breaks where staff_id = sa)::int, 1, 'no break on a day without a gap');
  perform tests.ok(exists (select 1 from public.business_special_days where business_id = b and date = '2031-09-10' and kind = 'closure' and is_closed and name = 'Inventory'),
    'business-wide closed override becomes a closure named after its reason');
  perform tests.ok(exists (select 1 from public.business_special_days where business_id = b and date = '2031-09-11' and kind = 'special_hours'
                              and start_time = '10:00' and end_time = '16:00'),
    'split override windows become one special-hours range');
  perform tests.eq((select count(*) from public.staff_time_off where business_id = b and starts_on = '2031-09-11'
                       and start_time = '12:00' and end_time = '14:00')::int, 4, 'the gap stays closed as partial time off for each of the 4 fixture staff');
  perform tests.ok(exists (select 1 from public.business_special_days where business_id = b and date = '2031-09-12' and is_closed and kind = 'closure'),
    'a closed override wins over an open window on the same date');
  perform tests.eq((select count(*) from public.availability_overrides where business_id = b and staff_id is null)::int, 0, 'business-wide overrides are gone');
  perform tests.eq((select count(*) from public.availability_overrides where business_id = b and staff_id = sa)::int, 1, 'per-staff overrides are kept');

  select count(*) into v_breaks from public.staff_breaks where business_id = b;
  perform private.convert_split_availability();
  perform tests.eq((select count(*) from public.staff_breaks where business_id = b)::int, v_breaks, 'conversion is idempotent');
end
$$;

select tests.as_admin();
rollback;
