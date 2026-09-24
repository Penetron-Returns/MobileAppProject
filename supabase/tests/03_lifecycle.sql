-- reschedule / cancel / status transitions / check-in and their events.
begin;

create temporary table f on commit drop as select tests.fixture('org_life', 10) as v;

do $$
declare
  f jsonb := (select v from f);
  a public.appointments;
  b public.appointments;
  r public.appointments;
  e public.appointment_events;
begin
  a := tests.book(f, 'staff_a', 'service_long', 'client_1', '2030-04-01 09:00Z');
  b := tests.book(f, 'staff_b', 'service_long', 'client_2', '2030-04-01 13:00Z');

  -- reschedule, same staff
  r := public.reschedule_appointment(p_appointment_id => a.id, p_starts_at => '2030-04-01 11:00Z',
                                     p_actor => 'staff', p_actor_id => 'user_x');
  perform tests.eq(r.slot, tstzrange('2030-04-01 11:00Z', '2030-04-01 12:00Z'), 'reschedule moves the slot');
  perform tests.eq(r.blocked, tstzrange('2030-04-01 11:00Z', '2030-04-01 12:10Z'), 'reschedule recomputes blocked with buffer');
  perform tests.eq(r.staff_id, a.staff_id, 'staff unchanged when p_staff_id is null');
  select * into e from public.appointment_events where appointment_id = a.id and type = 'rescheduled';
  perform tests.eq(e.payload, jsonb_build_object('from', '2030-04-01T09:00:00.000Z', 'to', '2030-04-01T11:00:00.000Z',
                                                 'from_staff_id', a.staff_id, 'to_staff_id', a.staff_id),
                   'rescheduled event payload {from, to, from_staff_id, to_staff_id}');
  perform tests.eq(e.actor_id, 'user_x', 'rescheduled event actor_id');

  -- reschedule to another staff
  r := public.reschedule_appointment(p_appointment_id => a.id, p_starts_at => '2030-04-01 09:00Z',
                                     p_actor => 'customer', p_actor_id => 'c1',
                                     p_staff_id => (f->>'staff_b')::uuid);
  perform tests.eq(r.staff_id, (f->>'staff_b')::uuid, 'reschedule can switch staff');

  -- into an overlap
  perform tests.throws(format($q$select public.reschedule_appointment(p_appointment_id => %L, p_starts_at => '2030-04-01 12:30Z', p_actor => 'staff', p_actor_id => 'u')$q$, a.id),
    '23P01', null, 'reschedule into an occupied slot → 23P01');
  -- to unqualified staff / on-leave staff
  perform tests.throws(format($q$select public.reschedule_appointment(p_appointment_id => %L, p_starts_at => '2030-04-02 09:00Z', p_actor => 'staff', p_actor_id => 'u', p_staff_id => %L)$q$,
      a.id, f->>'staff_leave'),
    'P0001', 'RULE:STAFF_INACTIVE:%', 'reschedule to staff on leave → RULE:STAFF_INACTIVE');
  perform tests.throws(format($q$select public.reschedule_appointment(p_appointment_id => %L, p_starts_at => '2030-04-02 09:00Z', p_actor => 'staff', p_actor_id => 'u')$q$,
      gen_random_uuid()),
    'P0002', 'appointment not found', 'reschedule unknown appointment → P0002');

  -- cancel
  r := public.cancel_appointment(b.id, 'customer', 'c2', 'Feeling ill');
  perform tests.eq(r.status::text, 'cancelled', 'cancel sets status cancelled');
  perform tests.ok(r.cancelled_at = now(), 'cancel sets cancelled_at');
  perform tests.eq(r.cancel_reason, 'Feeling ill', 'cancel stores reason');
  select * into e from public.appointment_events where appointment_id = b.id and type = 'cancelled';
  perform tests.eq(e.payload ->> 'reason', 'Feeling ill', 'cancelled event carries the reason');
  perform tests.eq(e.actor::text, 'customer', 'cancelled event actor');
  perform tests.throws(format($q$select public.cancel_appointment(%L, 'staff', 'u')$q$, b.id),
    'P0001', 'RULE:INVALID_STATUS:%', 'cancelling twice → RULE:INVALID_STATUS');
  perform tests.throws(format($q$select public.reschedule_appointment(p_appointment_id => %L, p_starts_at => '2030-04-03 09:00Z', p_actor => 'staff', p_actor_id => 'u')$q$, b.id),
    'P0001', 'RULE:INVALID_STATUS:%', 'rescheduling a cancelled appointment → RULE:INVALID_STATUS');
  perform tests.throws(format($q$select public.check_in_appointment(%L, 'u')$q$, b.id),
    'P0001', 'RULE:INVALID_STATUS:%', 'checking in a cancelled appointment → RULE:INVALID_STATUS');
end
$$;

do $$
declare
  f jsonb := (select v from f);
  a public.appointments;
  b public.appointments;
  r public.appointments;
begin
  a := tests.book(f, 'staff_a', 'service_short', 'client_1', '2030-04-05 09:00Z');
  b := tests.book(f, 'staff_a', 'service_short', 'client_2', '2030-04-05 10:00Z');

  -- check-in
  r := public.check_in_appointment(a.id, 'user_desk');
  perform tests.ok(r.checked_in_at = now(), 'check-in sets checked_in_at');
  perform tests.eq((select count(*) from public.appointment_events
                     where appointment_id = a.id and type = 'checked_in' and actor = 'staff' and actor_id = 'user_desk')::int,
                   1, 'checked_in event written with staff actor');
  r := public.check_in_appointment(a.id, 'user_desk');
  perform tests.eq((select count(*) from public.appointment_events where appointment_id = a.id and type = 'checked_in')::int,
                   1, 'repeat check-in is a no-op');

  -- status transitions
  r := public.set_appointment_status(a.id, 'completed', 'staff', 'user_desk');
  perform tests.eq(r.status::text, 'completed', 'confirmed → completed');
  perform tests.eq((select payload from public.appointment_events where appointment_id = a.id and type = 'completed'),
                   '{"from_status": "confirmed", "to_status": "completed"}'::jsonb, 'completed event written');
  perform tests.throws(format($q$select public.set_appointment_status(%L, 'no_show', 'staff', 'u')$q$, a.id),
    'P0001', 'RULE:INVALID_STATUS:%', 'completed → no_show is rejected');
  perform tests.throws(format($q$select public.cancel_appointment(%L, 'staff', 'u')$q$, a.id),
    'P0001', 'RULE:INVALID_STATUS:%', 'completed appointments cannot be cancelled');

  perform tests.throws(format($q$select public.set_appointment_status(%L, 'cancelled', 'staff', 'u')$q$, b.id),
    'P0001', 'RULE:INVALID_STATUS:%', 'set_appointment_status cannot cancel');
  perform tests.throws(format($q$select public.set_appointment_status(%L, 'confirmed', 'staff', 'u')$q$, b.id),
    'P0001', 'RULE:INVALID_STATUS:%', 'set_appointment_status cannot re-confirm');
  r := public.set_appointment_status(b.id, 'no_show', 'system', '');
  perform tests.eq(r.status::text, 'no_show', 'confirmed → no_show');
  perform tests.ok((select actor_id is null from public.appointment_events where appointment_id = b.id and type = 'no_show'),
                   'empty actor id is stored as null');
  perform tests.eq((select count(*) from public.appointment_events where appointment_id = b.id and type = 'no_show')::int,
                   1, 'no_show event written');

  -- a no-show frees nothing it should not: its slot still blocks (only cancelled frees)
  perform tests.throws(format($q$select tests.book(%L::jsonb, 'staff_a', 'service_short', 'client_1', '2030-04-05 10:00Z')$q$, f),
    '23P01', null, 'no_show appointments still occupy their slot');

  perform tests.throws(format($q$select public.set_appointment_status(%L, 'completed', 'staff', 'u')$q$, gen_random_uuid()),
    'P0002', 'appointment not found', 'status on unknown appointment → P0002');
end
$$;

rollback;
