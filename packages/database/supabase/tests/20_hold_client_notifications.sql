-- Act-then-undo: client_notify_after hold, atomic claim, reminders skip held rows, void_appointment
-- (voided_at, 'voided' event, no 'cancelled' event) and the stats that exclude voided bookings.
begin;

do $$
declare
  fa jsonb := tests.fixture('org_hold_a');
  ba uuid := (fa->>'business')::uuid;
  a1 public.appointments;
  a2 public.appointments;
  a3 public.appointments;
  r  public.appointments;
  n  integer;
begin
  a1 := tests.book(fa, 'staff_a', 'service_long',  'client_1', '2031-07-05 08:00Z');
  a2 := tests.book(fa, 'staff_a', 'service_short', 'client_2', '2031-07-05 10:00Z');
  a3 := tests.book(fa, 'staff_a', 'service_short', 'client_1', '2031-07-05 12:00Z');

  perform tests.ok(a1.client_notify_after is null and a1.voided_at is null, 'new appointments carry no hold and are not voided');
  perform tests.ok(exists (select 1 from pg_enum pe join pg_type t on t.oid = pe.enumtypid
                            where t.typname = 'appointment_event_type' and pe.enumlabel = 'voided'),
                   'appointment_event_type has voided');

  -- claim: only due holds, each returned once, cleared by the claim itself
  update public.appointments set client_notify_after = '2031-07-04 08:00:00Z' where id = a1.id;
  update public.appointments set client_notify_after = '2031-07-04 09:00:00Z' where id = a2.id;
  select count(*) into n from public.claim_due_client_notifications('2031-07-04 08:30:00Z', 10);
  perform tests.eq(n, 1, 'only the hold that has passed is claimed');
  select count(*) into n from public.claim_due_client_notifications('2031-07-04 08:30:00Z', 10);
  perform tests.eq(n, 0, 'a second claim returns nothing (idempotent)');
  perform tests.ok((select client_notify_after from public.appointments where id = a1.id) is null, 'the claim cleared the hold');
  perform tests.ok((select client_notify_after from public.appointments where id = a2.id) is not null, 'a future hold is untouched');

  -- reminders: a held appointment is never claimed; once released it can be
  update public.businesses set booking_rules = jsonb_set(booking_rules, '{reminder_offsets_minutes}', '[1440]') where id = ba;
  select count(*) into n from public.claim_due_reminders('2031-07-04 08:30:00Z', 100) c where c.appointment_id = a2.id;
  perform tests.eq(n, 0, 'claim_due_reminders skips a held appointment');
  update public.appointments set client_notify_after = null where id = a2.id;
  select count(*) into n from public.claim_due_reminders('2031-07-04 10:30:00Z', 100) c where c.appointment_id = a2.id;
  perform tests.eq(n, 1, 'claim_due_reminders reminds once the hold is cleared');

  -- void: cancelled + voided_at + voided event, no cancelled event, hold dropped, slot freed
  update public.appointments set client_notify_after = '2031-07-04 12:00:00Z' where id = a3.id;
  r := public.void_appointment(a3.id, 'nerova', 'nerova:c1');
  perform tests.ok(r.status = 'cancelled' and r.voided_at is not null and r.cancel_reason = 'voided' and r.client_notify_after is null,
                   'void cancels, marks voided_at and drops the hold');
  perform tests.eq((select count(*) from public.appointment_events where appointment_id = a3.id and type = 'voided' and actor = 'nerova')::int,
                   1, 'a voided event with the nerova actor');
  perform tests.eq((select count(*) from public.appointment_events where appointment_id = a3.id and type = 'cancelled')::int,
                   0, 'no cancelled event for a void');
  perform tests.throws(format($q$select public.void_appointment(%L, 'nerova', 'n')$q$, a3.id),
    'P0001', 'RULE:INVALID_STATUS:%', 'only a confirmed appointment can be voided');
  perform tests.throws(format($q$update public.appointments set voided_at = now() where id = %L$q$, a1.id),
    '23514', null, 'voided_at needs a cancelled appointment');

  -- stats: a plain cancellation counts, a void does not
  perform public.cancel_appointment(a1.id, 'staff', 'u');
  perform tests.eq(((public.month_report(ba, '2031-07-01', '2031-07-31 00:00:00Z'))->>'cancellations')::int, 1,
                   'month_report counts the cancellation but not the void');
  perform tests.eq(((public.month_report(ba, current_date, now()))->'bookings_created'->>'app')::int, 2,
                   'a voided booking is not counted as created');
end
$$;

rollback;
