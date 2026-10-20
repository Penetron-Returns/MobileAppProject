-- Client confirmation: both-or-neither constraint, the RPC (idempotent, scoped, no-op unless
-- confirmed, event with actor), and RLS (business-scoped read of the new columns, no writes).
begin;

create temporary table fx (label text primary key, v jsonb) on commit drop;
grant select on fx to authenticated;

do $$
declare
  fa jsonb := tests.fixture('org_cc_a');
  fb jsonb := tests.fixture('org_cc_b');
  ba uuid := (fa->>'business')::uuid;
  bb uuid := (fb->>'business')::uuid;
  a1 public.appointments;
  a2 public.appointments;
  a3 public.appointments;
  r  public.appointments;
begin
  insert into fx values ('a', fa), ('b', fb);
  insert into public.users (id, business_id, role) values ('cc_owner_a', ba, 'owner');

  a1 := tests.book(fa, 'staff_a', 'service_long',  'client_1', '2031-06-05 08:00Z');
  a2 := tests.book(fa, 'staff_a', 'service_short', 'client_2', '2031-06-05 10:00Z');
  a3 := tests.book(fb, 'staff_a', 'service_long',  'client_1', '2031-06-05 08:00Z');

  perform tests.ok(a1.client_confirmed_at is null and a1.client_confirmed_via is null, 'new appointments are unconfirmed');
  perform tests.ok(exists (select 1 from pg_enum pe join pg_type t on t.oid = pe.enumtypid
                            where t.typname = 'appointment_event_type' and pe.enumlabel = 'client_confirmed'),
                   'appointment_event_type has client_confirmed');

  -- constraint: both null or both set, via restricted
  perform tests.throws(format($q$update public.appointments set client_confirmed_at = now() where id = %L$q$, a1.id),
    '23514', null, 'a confirmation time needs a channel');
  perform tests.throws(format($q$update public.appointments set client_confirmed_via = 'web' where id = %L$q$, a1.id),
    '23514', null, 'a channel needs a confirmation time');
  perform tests.throws(format($q$update public.appointments set client_confirmed_at = now(), client_confirmed_via = 'pigeon' where id = %L$q$, a1.id),
    '23514', null, 'channel is restricted to whatsapp/sms/web/app');

  -- RPC
  r := public.confirm_appointment_by_client(ba, a1.id, '2031-06-04 07:00Z', 'whatsapp', 'nerova', 'nerova:c1', 'k1');
  perform tests.ok(r.client_confirmed_at = '2031-06-04 07:00Z' and r.client_confirmed_via = 'whatsapp', 'RPC sets both columns');
  perform tests.eq((select count(*) from public.appointment_events
                     where appointment_id = a1.id and type = 'client_confirmed' and actor = 'nerova' and actor_id = 'nerova:c1')::int,
                   1, 'client_confirmed event written with the nerova actor');
  r := public.confirm_appointment_by_client(ba, a1.id, '2031-06-04 09:00Z', 'sms', 'nerova', 'nerova:c1', 'k2');
  perform tests.ok(r.client_confirmed_at = '2031-06-04 07:00Z' and r.client_confirmed_via = 'whatsapp', 'a second confirmation returns the row unchanged');
  perform tests.eq((select count(*) from public.appointment_events where appointment_id = a1.id and type = 'client_confirmed')::int,
                   1, 'no second event');

  perform public.cancel_appointment(a2.id, 'staff', 'u');
  r := public.confirm_appointment_by_client(ba, a2.id, '2031-06-04 07:00Z', 'whatsapp', 'nerova', 'nerova', 'k3');
  perform tests.ok(r.status = 'cancelled' and r.client_confirmed_at is null, 'a cancelled appointment is returned unchanged');
  perform tests.eq((select count(*) from public.appointment_events where appointment_id = a2.id and type = 'client_confirmed')::int,
                   0, 'no event for a cancelled appointment');

  perform tests.throws(format($q$select public.confirm_appointment_by_client(%L, %L, now(), 'whatsapp', 'nerova', 'n', 'k')$q$, bb, a1.id),
    'P0002', 'appointment not found', 'another business cannot confirm it');
  perform tests.throws(format($q$select public.confirm_appointment_by_client(%L, %L, now(), 'pigeon', 'nerova', 'n', 'k')$q$, ba, a3.id),
    'P0001', 'RULE:INVALID_INPUT:%', 'an unknown channel is rejected');
end
$$;

-- RLS: owner of A reads the new columns of their business only, cannot write them or call the RPC
select tests.as_member('{"sub": "cc_owner_a", "org_id": "org_cc_a", "org_role": "org:admin", "role": "authenticated"}');
do $$
declare
  fa jsonb := (select v from fx where label = 'a');
  fb jsonb := (select v from fx where label = 'b');
begin
  perform tests.eq((select count(*) from public.appointments where client_confirmed_at is not null)::int, 1, 'member reads the confirmation columns');
  perform tests.eq((select count(*) from public.appointments where business_id = (fb->>'business')::uuid)::int, 0, 'other business appointments are invisible');
  perform tests.throws($q$update public.appointments set client_confirmed_at = null, client_confirmed_via = null$q$, '42501', null, 'authenticated cannot UPDATE appointments');
  perform tests.throws(format($q$select public.confirm_appointment_by_client(%L, gen_random_uuid(), now(), 'app', 'staff', 'u', 'k')$q$, fa->>'business'),
    '42501', null, 'authenticated cannot call the RPC');
end
$$;

rollback;
