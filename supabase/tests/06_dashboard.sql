-- dashboard_summary on a controlled fixture (March 2031, Africa/Johannesburg = UTC+2).
begin;

create temporary table f on commit drop as select tests.fixture('org_dash') as v;
create temporary table g on commit drop as select tests.fixture('org_dash_other') as v;
create temporary table ids (label text primary key, id uuid) on commit drop;
grant select on f, g, ids to authenticated;

do $$
declare
  f jsonb := (select v from f);
  g jsonb := (select v from g);
  a public.appointments;
  tz constant text := 'Africa/Johannesburg';
begin
  -- p_date = 2031-03-10
  a := tests.book(f, 'staff_a', 'service_long',  'client_1', timestamp '2031-03-10 09:00' at time zone tz);  -- completed
  perform public.check_in_appointment(a.id, 'u');
  perform public.set_appointment_status(a.id, 'completed', 'staff', 'u');
  a := tests.book(f, 'staff_a', 'service_short', 'client_2', timestamp '2031-03-10 10:00' at time zone tz);  -- confirmed, checked in
  perform public.check_in_appointment(a.id, 'u');
  a := tests.book(f, 'staff_b', 'service_long',  'client_1', timestamp '2031-03-10 11:00' at time zone tz);  -- confirmed → next
  insert into ids values ('next', a.id);
  a := tests.book(f, 'staff_a', 'service_short', 'client_2', timestamp '2031-03-10 12:00' at time zone tz);  -- cancelled
  perform public.cancel_appointment(a.id, 'staff', 'u');
  a := tests.book(f, 'staff_b', 'service_long',  'client_2', timestamp '2031-03-10 13:00' at time zone tz);  -- no_show
  perform public.set_appointment_status(a.id, 'no_show', 'staff', 'u');
  a := tests.book(f, 'staff_a', 'service_long',  'client_2', timestamp '2031-03-10 15:00' at time zone tz);  -- confirmed
  -- month boundaries in local time
  perform tests.book(f, 'staff_a', 'service_short', 'client_1', timestamp '2031-03-01 00:30' at time zone tz); -- Mar 1 (Feb 28 UTC)
  perform tests.book(f, 'staff_a', 'service_long',  'client_1', timestamp '2031-03-31 23:00' at time zone tz); -- Mar 31
  perform tests.book(f, 'staff_b', 'service_long',  'client_1', timestamp '2031-04-01 00:30' at time zone tz); -- April (Mar 31 UTC)
  perform tests.book(f, 'staff_b', 'service_long',  'client_1', timestamp '2031-02-28 23:00' at time zone tz); -- February
  -- another business in the same month must not leak in
  perform tests.book(g, 'staff_a', 'service_long',  'client_1', timestamp '2031-03-10 09:00' at time zone tz);
end
$$;

select tests.as_member('{"sub": "user_dash", "o": {"id": "org_dash", "rol": "admin"}}');

do $$
declare
  d jsonb := public.dashboard_summary('2031-03-10');
begin
  -- revenue = completed + confirmed: Mar 1 25000, Mar 10 50000+25000+50000+50000, Mar 31 50000
  perform tests.eq((d ->> 'month_revenue_cents')::bigint, 250000::bigint, 'month revenue = confirmed + completed within the local month');
  perform tests.eq(jsonb_array_length(d -> 'revenue_by_day'), 31, 'revenue_by_day covers every day of the month');
  perform tests.eq(d -> 'revenue_by_day' -> 0, '{"date": "2031-03-01", "cents": 25000}'::jsonb, 'local-midnight booking lands on Mar 1');
  perform tests.eq(d -> 'revenue_by_day' -> 9, '{"date": "2031-03-10", "cents": 175000}'::jsonb, 'Mar 10 excludes cancelled/no-show');
  perform tests.eq(d -> 'revenue_by_day' -> 30, '{"date": "2031-03-31", "cents": 50000}'::jsonb, 'Mar 31 excludes the April 00:30 booking');
  perform tests.eq(d -> 'revenue_by_day' -> 1, '{"date": "2031-03-02", "cents": 0}'::jsonb, 'empty days are zero');
  perform tests.eq(d -> 'today', '{"total": 6, "confirmed": 3, "completed": 1, "cancelled": 1, "no_show": 1, "checked_in": 2}'::jsonb,
                   'today counts by status');
  perform tests.eq((d ->> 'next_appointment_id')::uuid, (select id from ids where label = 'next'),
                   'next appointment = earliest confirmed, not checked-in');
end
$$;

-- Clerk v1 claims for the other business see only their own numbers
select tests.as_member('{"sub": "user_other", "org_id": "org_dash_other"}');
do $$
declare
  d jsonb := public.dashboard_summary('2031-03-10');
begin
  perform tests.eq((d ->> 'month_revenue_cents')::bigint, 50000::bigint, 'other business sees only its own revenue');
  perform tests.eq((d -> 'today' ->> 'total')::int, 1, 'other business sees only its own appointments');
end
$$;

do $$
declare
  d jsonb := public.dashboard_summary('2031-05-01');
begin
  perform tests.eq((d ->> 'month_revenue_cents')::bigint, 0::bigint, 'empty month → zero revenue');
  perform tests.ok(d -> 'next_appointment_id' = 'null'::jsonb, 'empty day → null next_appointment_id');
  perform tests.eq(jsonb_array_length(d -> 'revenue_by_day'), 31, 'May has 31 days');
end
$$;

-- a member of an unknown org gets NOT_FOUND
select tests.as_member('{"sub": "user_x", "org_id": "org_unknown"}');
do $$
begin
  perform tests.throws($q$select public.dashboard_summary('2031-03-10')$q$, 'P0002', null,
    'dashboard_summary without a linked business → P0002');
end
$$;

select tests.as_anon();
do $$
begin
  perform tests.throws($q$select public.dashboard_summary('2031-03-10')$q$, '42501', null,
    'anon cannot call dashboard_summary');
end
$$;

rollback;
