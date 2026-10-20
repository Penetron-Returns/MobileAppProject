-- claim_due_reminders: due windows, once-only claims, reschedule, limit.
-- Uses a fixed p_now far in the future so it cannot collide with seed data.
begin;

create temporary table f on commit drop as select tests.fixture('org_remind') as v;
create temporary table appts (label text primary key, id uuid) on commit drop;

do $$
declare
  f jsonb := (select v from f);
  c_now constant timestamptz := '2035-06-10 08:00Z';
begin
  insert into appts values
    -- starts in 23h50m: 1440 offset due 10 min ago; 120 not yet
    ('day_ahead',    (tests.book(f, 'staff_a', 'service_short', 'client_1', c_now + interval '23 hours 50 minutes')).id),
    -- starts in exactly 2h: 120 offset due now (<= p_now); 1440 long passed (skipped)
    ('two_hours',    (tests.book(f, 'staff_b', 'service_long',  'client_2', c_now + interval '2 hours')).id),
    -- starts in 3h: 120 due in 1h; 1440 passed by 21h → skipped
    ('three_hours',  (tests.book(f, 'staff_a', 'service_short', 'client_2', c_now + interval '3 hours')).id),
    -- 1440 window passed 40 min ago → skipped (more than 30 min late)
    ('late',         (tests.book(f, 'staff_a', 'service_short', 'client_1', c_now + interval '23 hours 20 minutes')).id),
    -- due, but cancelled
    ('cancelled',    (tests.book(f, 'staff_b', 'service_long',  'client_1', c_now + interval '23 hours 55 minutes')).id),
    -- already started
    ('past',         (tests.book(f, 'staff_a', 'service_short', 'client_1', c_now - interval '10 minutes')).id);
  perform public.cancel_appointment((select id from appts where label = 'cancelled'), 'staff', 'u');
end
$$;

do $$
declare
  c_now constant timestamptz := '2035-06-10 08:00Z';
  v_claimed jsonb;
  v_again int;
begin
  select jsonb_agg(jsonb_build_object('label', a.label, 'offset', r.offset_minutes, 'starts_at', r.starts_at) order by a.label)
    into v_claimed
    from public.claim_due_reminders(c_now) r
    join appts a on a.id = r.appointment_id;

  perform tests.eq(jsonb_array_length(v_claimed), 2, 'exactly two reminders due');
  perform tests.eq(v_claimed -> 0 ->> 'label', 'day_ahead', 'day-ahead reminder claimed');
  perform tests.eq((v_claimed -> 0 ->> 'offset')::int, 1440, 'with offset 1440');
  perform tests.eq(v_claimed -> 1 ->> 'label', 'two_hours', 'two-hour reminder claimed');
  perform tests.eq((v_claimed -> 1 ->> 'offset')::int, 120, 'with offset 120');

  perform tests.eq((select count(*) from public.appointment_events e join appts a on a.id = e.appointment_id
                     where e.type = 'reminder_sent' and e.payload ->> 'state' = 'claimed')::int,
                   2, 'reminder_sent events inserted with state=claimed');

  select count(*) into v_again from public.claim_due_reminders(c_now);
  perform tests.eq(v_again, 0, 'a second claim at the same time returns nothing');
  select count(*) into v_again from public.claim_due_reminders(c_now + interval '5 minutes');
  perform tests.eq(v_again, 0, 'nor five minutes later (never twice for the same offset)');

  -- one hour later the three-hour appointment's 120 reminder is due
  select count(*) into v_again
    from public.claim_due_reminders(c_now + interval '1 hour') r
    join appts a on a.id = r.appointment_id and a.label = 'three_hours' and r.offset_minutes = 120;
  perform tests.eq(v_again, 1, 'later offset becomes due on its own schedule');

  -- inserting a duplicate claim directly is rejected by the partial unique index
  perform tests.throws(format($q$insert into public.appointment_events (business_id, appointment_id, type, actor, payload)
                                select business_id, appointment_id, type, actor, payload from public.appointment_events
                                 where type = 'reminder_sent' and appointment_id = %L$q$,
                              (select id from appts where label = 'day_ahead')),
    '23505', null, 'unique index forbids a second reminder_sent for the same offset');
end
$$;

-- rescheduling gives the new time its own reminders
do $$
declare
  c_now constant timestamptz := '2035-06-10 08:00Z';
  v_id uuid := (select id from appts where label = 'day_ahead');
  v_n int;
begin
  perform public.reschedule_appointment(p_appointment_id => v_id, p_starts_at => c_now + interval '23 hours 52 minutes',
                                        p_actor => 'staff', p_actor_id => 'u');
  select count(*) into v_n from public.claim_due_reminders(c_now) r where r.appointment_id = v_id and r.offset_minutes = 1440;
  perform tests.eq(v_n, 1, 'rescheduled appointment is reminded again for its new time');
  select count(*) into v_n from public.claim_due_reminders(c_now) r where r.appointment_id = v_id;
  perform tests.eq(v_n, 0, 'and only once');
end
$$;

-- p_limit: five offsets due at once for one appointment
do $$
declare
  f jsonb := (select v from f);
  c_now constant timestamptz := '2036-01-10 08:00Z';
  v_n int;
begin
  update public.businesses
     set booking_rules = booking_rules || '{"reminder_offsets_minutes": [60, 55, 50, 45, 40, 40, "junk", -5]}'
   where id = (f->>'business')::uuid;
  perform tests.book(f, 'staff_a', 'service_short', 'client_1', c_now + interval '60 minutes');
  select count(*) into v_n from public.claim_due_reminders(c_now + interval '20 minutes', 2);
  perform tests.eq(v_n, 2, 'p_limit caps the batch');
  select count(*) into v_n from public.claim_due_reminders(c_now + interval '20 minutes', 100);
  perform tests.eq(v_n, 3, 'next call picks up the rest (duplicate / non-numeric / negative offsets ignored)');
  select count(*) into v_n from public.claim_due_reminders(c_now + interval '20 minutes', 100);
  perform tests.eq(v_n, 0, 'until nothing is left');
end
$$;

rollback;
