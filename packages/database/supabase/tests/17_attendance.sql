-- Attendance checks: setting constraint, one question per appointment, answer-state check,
-- RLS (business-scoped read, no writes, push log hidden), anti-join RPC and its grants.
begin;

create temporary table fx (label text primary key, v jsonb) on commit drop;
grant select on fx to authenticated;

do $$
declare
  fa jsonb := tests.fixture('org_att_a');
  fb jsonb := tests.fixture('org_att_b');
  ba uuid := (fa->>'business')::uuid;
  bb uuid := (fb->>'business')::uuid;
  a1 public.appointments;
  a2 public.appointments;
  a3 public.appointments;
  b1 public.appointments;
begin
  insert into fx values ('a', fa), ('b', fb);
  insert into public.users (id, business_id, role) values ('att_owner_a', ba, 'owner'), ('att_staff_a', ba, 'staff'), ('att_owner_b', bb, 'owner');
  update public.staff set user_id = 'att_staff_a' where id = (fa->>'staff_a')::uuid;

  a1 := tests.book(fa, 'staff_a', 'service_long',  'client_1', '2031-05-05 08:00Z');
  a2 := tests.book(fa, 'staff_a', 'service_short', 'client_2', '2031-05-05 10:00Z');
  a3 := tests.book(fa, 'staff_b', 'service_long',  'client_1', '2031-05-05 08:00Z');
  b1 := tests.book(fb, 'staff_a', 'service_long',  'client_1', '2031-05-05 08:00Z');
  perform public.check_in_appointment(a3.id, 'att_staff_a');

  -- setting
  perform tests.eq((select attendance_mode from public.businesses where id = ba), 'staff', 'attendance_mode defaults to staff');
  update public.businesses set attendance_mode = 'owner' where id = ba;
  perform tests.eq((select attendance_mode from public.businesses where id = ba), 'owner', 'attendance_mode can be owner');
  perform tests.throws(format($q$update public.businesses set attendance_mode = 'everyone' where id = %L$q$, ba),
    '23514', null, 'attendance_mode rejects unknown values');
  update public.businesses set attendance_mode = 'staff' where id = ba;

  -- one question per appointment
  insert into public.attendance_checks (business_id, appointment_id, audience, recipient_user_id)
    values (ba, a1.id, 'staff', 'att_staff_a');
  perform tests.throws(format($q$insert into public.attendance_checks (business_id, appointment_id, audience) values (%L, %L, 'owner')$q$, ba, a1.id),
    '23505', null, 'a second check for the same appointment is rejected');
  perform tests.throws(format($q$insert into public.attendance_checks (business_id, appointment_id, audience) values (%L, %L, 'owner')$q$, bb, a2.id),
    '23503', null, 'a check cannot point at another business appointment');
  perform tests.throws(format($q$insert into public.attendance_checks (business_id, appointment_id, audience) values (%L, %L, 'everyone')$q$, ba, a2.id),
    '23514', null, 'audience is constrained');
  perform tests.throws(format($q$update public.attendance_checks set status = 'answered' where appointment_id = %L$q$, a1.id),
    '23514', null, 'answered needs an outcome and a timestamp');
  perform tests.throws(format($q$update public.attendance_checks set outcome = 'came' where appointment_id = %L$q$, a1.id),
    '23514', null, 'a pending check carries no outcome');
  perform tests.throws(format($q$update public.attendance_checks set outcome = 'maybe' where appointment_id = %L$q$, a1.id),
    '23514', null, 'outcome is constrained');
  update public.attendance_checks set status = 'answered', outcome = 'no_show', answered_at = now(), answered_by = 'att_owner_a'
   where appointment_id = a1.id;
  perform tests.ok((select status = 'answered' and outcome = 'no_show' from public.attendance_checks where appointment_id = a1.id),
    'a check can be answered');
  insert into public.attendance_checks (business_id, appointment_id, audience) values (bb, b1.id, 'owner');
  insert into public.attendance_pushes (business_id, user_id, kind, local_date) values (ba, 'att_staff_a', 'check', '2031-05-05');

  -- the finder: confirmed, ended in the window, no check yet
  perform tests.eq((select count(*) from public.attendance_due_appointments('2031-05-05 12:00Z', '2031-05-04 00:00Z', 50) where business_id = ba)::int, 2,
    'finder returns the unasked confirmed appointments (a1 has a check)');
  perform tests.eq((select count(*) from public.attendance_due_appointments('2031-05-05 10:05Z', '2031-05-04 00:00Z', 50) where business_id = ba)::int, 1,
    'finder excludes appointments that have not ended yet');
  perform tests.eq((select count(*) from public.attendance_due_appointments('2031-05-05 12:00Z', '2031-05-05 09:30Z', 50) where business_id = ba)::int, 1,
    'finder honours the lookback bound');
  perform tests.ok((select checked_in_at is not null and staff_user_id is null from public.attendance_due_appointments('2031-05-05 12:00Z', '2031-05-04 00:00Z', 50) where appointment_id = a3.id),
    'finder reports check-in and a staff member with no linked user');
  perform tests.ok((select staff_user_id = 'att_staff_a' and client_name = 'Client Two' and service_name = 'Short'
                      from public.attendance_due_appointments('2031-05-05 12:00Z', '2031-05-04 00:00Z', 50) where appointment_id = a2.id),
    'finder reports the linked user, client and service');
  perform public.cancel_appointment(a2.id, 'staff', 'u');
  perform tests.eq((select count(*) from public.attendance_due_appointments('2031-05-05 12:00Z', '2031-05-04 00:00Z', 50) where business_id = ba)::int, 1,
    'finder skips cancelled appointments');
  perform tests.eq((select count(*) from public.attendance_due_appointments('2031-05-05 12:00Z', '2031-05-04 00:00Z', 0))::int, 0, 'finder honours the limit');
end
$$;

-- RLS: owner of A sees only A's checks, cannot write, cannot read the push log
select tests.as_member('{"sub": "att_owner_a", "org_id": "org_att_a", "org_role": "org:admin", "role": "authenticated"}');
do $$
declare
  fa jsonb := (select v from fx where label = 'a');
  fb jsonb := (select v from fx where label = 'b');
begin
  perform tests.eq((select count(*) from public.attendance_checks)::int, 1, 'member reads only their business checks');
  perform tests.eq((select count(*) from public.attendance_checks where business_id = (fb->>'business')::uuid)::int, 0, 'other business checks are invisible');
  perform tests.throws(format($q$insert into public.attendance_checks (business_id, appointment_id, audience) values (%L, gen_random_uuid(), 'owner')$q$, fa->>'business'),
    '42501', null, 'authenticated cannot INSERT checks');
  perform tests.throws($q$update public.attendance_checks set status = 'pending'$q$, '42501', null, 'authenticated cannot UPDATE checks');
  perform tests.throws($q$delete from public.attendance_checks$q$, '42501', null, 'authenticated cannot DELETE checks');
  perform tests.throws($q$select count(*) from public.attendance_pushes$q$, '42501', null, 'authenticated cannot read the push log');
  perform tests.throws($q$select * from public.attendance_due_appointments(now(), now(), 1)$q$, '42501', null, 'authenticated cannot call the finder');
end
$$;

select tests.as_anon();
do $$
begin
  perform tests.throws($q$select count(*) from public.attendance_checks$q$, '42501', null, 'anon cannot read checks');
end
$$;

select tests.as_admin();
do $$
begin
  perform tests.ok(private.invoke_cron_job('attendance') is null, 'attendance is a whitelisted job (no-op without vault/pg_net)');
end
$$;

rollback;
