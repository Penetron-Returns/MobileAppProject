-- Companion usage: completed_jobs_in_month, month_report, the reports entitlement and nerova_account_id.
-- March 2031, Africa/Johannesburg (UTC+2, no DST). 2031-03-01 is a Saturday, so Mondays are 3, 10, 17, 24, 31.
begin;

create temporary table f on commit drop as select tests.fixture('org_usage') as v;
create temporary table g on commit drop as select tests.fixture('org_usage_other') as v;
create temporary table ids (label text primary key, id uuid) on commit drop;
grant select on f, g, ids to authenticated;

do $$
declare
  f jsonb := (select v from f);
  g jsonb := (select v from g);
  tz constant text := 'Africa/Johannesburg';
  a public.appointments;
begin
  -- completed in March (ended by 2031-03-20 12:00 local)
  a := tests.book(f, 'staff_a', 'service_long',  'client_1', timestamp '2031-03-03 09:00' at time zone tz);  -- A Mon 09
  insert into ids values ('a', a.id);
  a := tests.book(f, 'staff_a', 'service_long',  'client_1', timestamp '2031-03-03 10:00' at time zone tz);  -- B Mon 10, marked completed
  perform public.set_appointment_status(a.id, 'completed', 'staff', 'u');
  insert into ids values ('b', a.id);
  a := tests.book(f, 'staff_a', 'service_short', 'client_2', timestamp '2031-03-10 09:00' at time zone tz);  -- C Mon 09
  insert into ids values ('c', a.id);
  a := tests.book(f, 'staff_a', 'service_long',  'client_2', timestamp '2031-03-20 11:00' at time zone tz);  -- G ends exactly at "now": counts
  insert into ids values ('g', a.id);
  a := tests.book(f, 'staff_a', 'service_long',  'client_1', timestamp '2031-02-28 23:30' at time zone tz);  -- H ends Mar 1 00:30 local: March
  insert into ids values ('h', a.id);
  -- never counted
  a := tests.book(f, 'staff_a', 'service_long',  'client_1', timestamp '2031-03-04 09:00' at time zone tz);  -- D cancelled
  perform public.cancel_appointment(a.id, 'staff', 'u');
  insert into ids values ('d', a.id);
  a := tests.book(f, 'staff_a', 'service_long',  'client_1', timestamp '2031-03-05 09:00' at time zone tz);  -- E no-show
  perform public.set_appointment_status(a.id, 'no_show', 'staff', 'u');
  insert into ids values ('e', a.id);
  a := tests.book(f, 'staff_a', 'service_long',  'client_1', timestamp '2031-03-25 09:00' at time zone tz);  -- F has not happened yet
  insert into ids values ('f', a.id);
  a := tests.book(f, 'staff_a', 'service_long',  'client_1', timestamp '2031-03-31 23:30' at time zone tz);  -- I ends Apr 1 00:30 local: April
  insert into ids values ('i', a.id);
  -- another business must never leak in
  perform tests.book(g, 'staff_a', 'service_long', 'client_1', timestamp '2031-03-10 09:00' at time zone tz);

  -- created_at / source for the "bookings created" breakdown
  update public.appointments set source = 'whatsapp', created_at = timestamp '2031-03-02 08:00' at time zone tz where id in ((select id from ids where label = 'a'), (select id from ids where label = 'b'));
  update public.appointments set source = 'nerova',   created_at = timestamp '2031-03-09 08:00' at time zone tz where id = (select id from ids where label = 'c');
  update public.appointments set source = 'web',      created_at = timestamp '2031-03-04 08:00' at time zone tz where id = (select id from ids where label = 'e');
  update public.appointments set source = 'app',      created_at = timestamp '2031-03-10 08:00' at time zone tz where id in ((select id from ids where label = 'd'), (select id from ids where label = 'f'), (select id from ids where label = 'g'));
  update public.appointments set source = 'app',      created_at = timestamp '2031-02-20 08:00' at time zone tz where id = (select id from ids where label = 'h');
  update public.appointments set source = 'whatsapp', created_at = timestamp '2031-04-01 00:10' at time zone tz where id = (select id from ids where label = 'i');
end
$$;

do $$
declare
  b uuid := ((select v from f)->>'business')::uuid;
  tz constant text := 'Africa/Johannesburg';
  now_mar constant timestamptz := timestamp '2031-03-20 12:00' at time zone 'Africa/Johannesburg';
  r jsonb;
begin
  perform tests.eq(public.completed_jobs_in_month(b, date '2031-03-17', now_mar), 5,
                   'completed jobs: ended, by end time in the local month, not cancelled / no-show / future (ends exactly now counts)');
  perform tests.eq(public.completed_jobs_in_month(b, date '2031-03-01', now_mar - interval '1 second'), 4, 'a job ending one second after now does not count');
  perform tests.eq(public.completed_jobs_in_month(b, date '2031-02-01', now_mar), 0, 'the job that started in February but ended on Mar 1 local is not in February');
  perform tests.eq(public.completed_jobs_in_month(b, date '2031-04-15', timestamp '2031-04-30 12:00' at time zone tz), 1,
                   'the Mar 31 23:30 job ending Apr 1 00:30 local counts in April (it is still Mar 31 in UTC)');
  perform tests.eq(public.completed_jobs_in_month(b, date '2031-03-31', timestamp '2031-04-30 12:00' at time zone tz), 6,
                   'later, the March count also gains the job that has since ended');
  perform tests.throws(format('select public.completed_jobs_in_month(%L, date ''2031-03-01'')', gen_random_uuid()), 'P0002', null, 'unknown business is NOT_FOUND');

  r := public.month_report(b, date '2031-03-01', now_mar);
  perform tests.eq((r ->> 'completed_jobs')::int, 5, 'report: completed jobs match the count');
  perform tests.eq((r ->> 'revenue_cents')::bigint, 225000::bigint, 'report: revenue = sum of completed price_cents (4 long + 1 short)');
  perform tests.eq(r -> 'bookings_created', '{"whatsapp": 2, "nerova": 1, "app": 3, "web": 1}'::jsonb, 'report: bookings created in the month by source (Feb and April excluded)');
  perform tests.eq((r ->> 'no_shows')::int, 1, 'report: no-shows starting in the month');
  perform tests.eq((r ->> 'cancellations')::int, 1, 'report: cancellations starting in the month');
  perform tests.eq(r -> 'busiest', '{"weekday": 1, "hour": 9}'::jsonb, 'report: busiest = Monday at 09:00');
  perform tests.eq(r -> 'weekly', '[{"week_start":"2031-02-24","completed_jobs":1},{"week_start":"2031-03-03","completed_jobs":2},{"week_start":"2031-03-10","completed_jobs":1},{"week_start":"2031-03-17","completed_jobs":1},{"week_start":"2031-03-24","completed_jobs":0},{"week_start":"2031-03-31","completed_jobs":0}]'::jsonb,
                   'report: Monday-start weeks touching the month, zeros included');

  r := public.month_report(b, date '2031-05-01', timestamp '2031-05-31 12:00' at time zone tz);
  perform tests.eq((r ->> 'completed_jobs')::int, 0, 'empty month: no jobs');
  perform tests.eq(r -> 'busiest', 'null'::jsonb, 'empty month: busiest is null');
  perform tests.eq(r -> 'bookings_created', '{"whatsapp": 0, "nerova": 0, "app": 0, "web": 0}'::jsonb, 'empty month: zero sources');
  perform tests.eq(jsonb_array_length(r -> 'weekly'), 5, 'May 2031 touches five Monday-start weeks');
end
$$;

-- reports entitlement and the nerova_account_id column
do $$
declare
  a uuid := ((select v from f)->>'business')::uuid;
begin
  perform tests.eq((select array_agg(plan::text order by plan) from public.plan_features where feature = 'reports'),
                   array['starter','growth','pro'], 'reports is on every paid plan');
  perform tests.ok(not exists (select 1 from public.plan_features where plan = 'free' and feature in ('reports', 'companion')), 'free has no reports or companion');
  perform tests.ok((select nerova_account_id is null from public.businesses where id = a), 'nerova_account_id defaults to null');
  update public.businesses set nerova_account_id = 'acct_123' where id = a;
  perform tests.eq((select nerova_account_id from public.businesses where id = a), 'acct_123', 'nerova_account_id can be cached');
  perform tests.throws(format('update public.businesses set nerova_account_id = '''' where id = %L', a), '23514', null, 'an empty account id is rejected');
end
$$;

select tests.as_member('{"sub": "user_usage", "o": {"id": "org_usage", "rol": "admin"}}');
do $$
declare
  a uuid := ((select v from f)->>'business')::uuid;
begin
  perform tests.eq((select nerova_account_id from public.businesses where id = a), 'acct_123', 'a member can read their own nerova_account_id');
  perform tests.throws(format('select public.completed_jobs_in_month(%L, date ''2031-03-01'')', a), '42501', null, 'members cannot call completed_jobs_in_month');
  perform tests.throws(format('select public.month_report(%L, date ''2031-03-01'')', a), '42501', null, 'members cannot call month_report');
  perform tests.throws('update public.businesses set nerova_account_id = ''acct_evil''', '42501', null, 'members cannot write nerova_account_id');
end
$$;

select tests.as_anon();
do $$
begin
  perform tests.throws('select public.month_report(gen_random_uuid(), date ''2031-03-01'')', '42501', null, 'anon cannot call month_report');
end
$$;

select tests.as_admin();
rollback;
