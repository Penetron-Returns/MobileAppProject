-- Schema-level constraints: checks, cross-business FKs, cascades.
begin;

create temporary table f on commit drop as select tests.fixture('org_schema_a') as v;
create temporary table g on commit drop as select tests.fixture('org_schema_b') as v;
grant select on f, g to authenticated, anon;

do $$
declare
  f jsonb := (select v from f);
  g jsonb := (select v from g);
  v_conv uuid;
  s text;
begin
  -- conversations.state: exactly the §5 list
  insert into public.conversations (business_id, client_id)
  values ((f->>'business')::uuid, (f->>'client_1')::uuid) returning id into v_conv;
  foreach s in array array['idle','menu','flow_booking','flow_reschedule','select_service','select_staff',
    'select_date','select_slot','confirm','manage_booking','manage_appointment','reschedule_select_date',
    'reschedule_select_slot','reschedule_confirm','cancel_confirm','escalated','closed']
  loop
    update public.conversations set state = s where id = v_conv;
  end loop;
  perform tests.ok(true, 'conversations.state accepts all 17 engine states');
  perform tests.throws(format($q$update public.conversations set state = 'thinking' where id = %L$q$, v_conv),
    '23514', '%conversations_state_check%', 'conversations.state rejects an unknown state');
  perform tests.eq((select count(*) from pg_constraint c
                     where c.conname = 'conversations_state_check'
                       and (select count(*) from regexp_matches(pg_get_constraintdef(c.oid), '''[a-z_]+''', 'g')) = 17)::int,
                   1, 'state check lists exactly 17 states');
  perform tests.throws(format($q$insert into public.conversations (business_id, client_id) values (%L, %L)$q$,
      f->>'business', f->>'client_1'),
    '23505', null, 'one conversation per client');

  -- clients
  perform tests.throws(format($q$insert into public.clients (business_id, phone_e164) values (%L, '0821234567')$q$, f->>'business'),
    '23514', null, 'clients.phone_e164 must be E.164');
  perform tests.throws(format($q$insert into public.clients (business_id, phone_e164) values (%L, '+27820000001')$q$, f->>'business'),
    '23505', null, 'clients unique per (business, phone)');
  insert into public.clients (business_id, phone_e164) values ((f->>'business')::uuid, '+27825550001');
  insert into public.clients (business_id, phone_e164) values ((g->>'business')::uuid, '+27825550001');
  perform tests.ok(true, 'same phone may exist in another business');

  -- services / hours
  perform tests.throws(format($q$insert into public.services (business_id, name, duration_minutes) values (%L, 'x', 0)$q$, f->>'business'),
    '23514', null, 'services.duration_minutes > 0');
  perform tests.throws(format($q$insert into public.services (business_id, name, duration_minutes) values (%L, 'x', 721)$q$, f->>'business'),
    '23514', null, 'services.duration_minutes <= 720');
  perform tests.throws(format($q$insert into public.business_hours (business_id, weekday, opens_at, closes_at) values (%L, 1, '10:00', '09:00')$q$, f->>'business'),
    '23514', null, 'business_hours closes_at > opens_at');
  perform tests.throws(format($q$insert into public.business_hours (business_id, weekday, opens_at, closes_at) values (%L, 7, '09:00', '10:00')$q$, f->>'business'),
    '23514', null, 'business_hours weekday 0..6');

  -- cross-business integrity via composite FKs
  perform tests.throws(format($q$insert into public.staff_services (business_id, staff_id, service_id) values (%L, %L, %L)$q$,
      f->>'business', f->>'staff_b', g->>'service_short'),
    '23503', null, 'staff_services cannot link a service of another business');
  perform tests.throws(format($q$insert into public.appointments (business_id, client_id, staff_id, service_id, slot, blocked, source, price_cents, duration_minutes)
      values (%L, %L, %L, %L, tstzrange('2030-01-01 09:00Z','2030-01-01 10:00Z'), tstzrange('2030-01-01 09:00Z','2030-01-01 10:00Z'), 'app', 0, 60)$q$,
      f->>'business', g->>'client_1', f->>'staff_a', f->>'service_long'),
    '23503', null, 'appointment cannot reference a client of another business');

  -- appointment range checks
  perform tests.throws(format($q$insert into public.appointments (business_id, client_id, staff_id, service_id, slot, blocked, source, price_cents, duration_minutes)
      values (%L, %L, %L, %L, tstzrange('2030-01-01 09:00Z','2030-01-01 10:00Z'), tstzrange('2030-01-01 09:00Z','2030-01-01 09:30Z'), 'app', 0, 60)$q$,
      f->>'business', f->>'client_1', f->>'staff_a', f->>'service_long'),
    '23514', '%appointments_blocked_check%', 'blocked must contain slot');
  perform tests.throws(format($q$insert into public.appointments (business_id, client_id, staff_id, service_id, slot, blocked, source, price_cents, duration_minutes)
      values (%L, %L, %L, %L, tstzrange('2030-01-01 09:00Z','2030-01-01 10:00Z', '[]'), tstzrange('2030-01-01 09:00Z','2030-01-01 11:00Z', '[)'), 'app', 0, 60)$q$,
      f->>'business', f->>'client_1', f->>'staff_a', f->>'service_long'),
    '23514', '%appointments_slot_check%', 'slot must be [) bounded');
  perform tests.throws(format($q$insert into public.appointments (business_id, client_id, staff_id, service_id, slot, blocked, source, price_cents, duration_minutes)
      values (%L, %L, %L, %L, tstzrange('2030-01-01 09:00Z','2030-01-01 10:00Z'), tstzrange('2030-01-01 09:00Z','2030-01-01 10:00Z'), 'app', 0, 45)$q$,
      f->>'business', f->>'client_1', f->>'staff_a', f->>'service_long'),
    '23514', '%appointments_slot_check%', 'slot length must equal duration_minutes');
end
$$;

-- generated starts_at / ends_at mirror the slot
do $$
declare
  f jsonb := (select v from f);
  a public.appointments;
begin
  a := tests.book(f, 'staff_a', 'service_long', 'client_1', '2030-01-01 09:00Z');
  perform tests.ok(a.starts_at = lower(a.slot) and a.ends_at = upper(a.slot), 'starts_at/ends_at mirror slot bounds');

  -- restrict: a client with appointments cannot be deleted
  perform tests.throws(format('delete from public.clients where id = %L', f->>'client_1'),
    '23503', null, 'client with appointments cannot be deleted');
  perform tests.throws(format('delete from public.staff where id = %L', f->>'staff_a'),
    '23503', null, 'staff with appointments cannot be deleted');
  perform tests.throws(format('delete from public.services where id = %L', f->>'service_long'),
    '23503', null, 'service with appointments cannot be deleted');

  -- but deleting the whole business cascades cleanly through everything
  delete from public.businesses where id = (f->>'business')::uuid;
  perform tests.eq((select count(*) from public.appointments where business_id = (f->>'business')::uuid)::int, 0,
    'deleting a business cascades to appointments');
  perform tests.eq((select count(*) from public.clients where business_id = (f->>'business')::uuid)::int, 0,
    'deleting a business cascades to clients');
end
$$;

-- updated_at trigger
do $$
declare
  g jsonb := (select v from g);
  v_before timestamptz;
  v_after  timestamptz;
begin
  update public.services set updated_at = '2000-01-01' where id = (g->>'service_long')::uuid;
  select updated_at into v_before from public.services where id = (g->>'service_long')::uuid;
  perform tests.ok(v_before = now(), 'updated_at is maintained by trigger (overrides explicit value)');
end
$$;

rollback;
