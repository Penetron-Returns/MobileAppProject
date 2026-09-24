-- create_appointment: overlap, buffer, idempotency, RULE errors, snapshot.
begin;

create temporary table f on commit drop as select tests.fixture('org_create_a', 15) as v;  -- 15 min buffer
create temporary table g on commit drop as select tests.fixture('org_create_b') as v;      -- no buffer

-- ---------------------------------------------------------------- overlaps
do $$
declare
  f jsonb := (select v from f);
  a public.appointments;
  b public.appointments;
begin
  a := tests.book(f, 'staff_a', 'service_long', 'client_1', '2030-03-04 09:00Z');
  perform tests.eq(a.status::text, 'confirmed', 'new appointment is confirmed');
  perform tests.eq(a.slot, tstzrange('2030-03-04 09:00Z', '2030-03-04 10:00Z', '[)'), 'slot = [start, start + duration)');
  perform tests.eq(a.blocked, tstzrange('2030-03-04 09:00Z', '2030-03-04 10:15Z', '[)'), 'blocked = slot + buffer_minutes');
  perform tests.eq(a.price_cents, 50000, 'price snapshotted from service');
  perform tests.eq(a.duration_minutes, 60, 'duration snapshotted from service');
  perform tests.eq(a.created_by, 'user_test', 'created_by = actor id');

  perform tests.throws(format($q$select tests.book(%L::jsonb, 'staff_a', 'service_short', 'client_2', '2030-03-04 09:30Z')$q$, f),
    '23P01', null, 'overlapping booking for the same staff is rejected (23P01)');
  perform tests.throws(format($q$select tests.book(%L::jsonb, 'staff_a', 'service_short', 'client_2', '2030-03-04 10:00Z')$q$, f),
    '23P01', null, 'booking inside the buffer after an appointment is rejected');
  perform tests.throws(format($q$select tests.book(%L::jsonb, 'staff_a', 'service_short', 'client_2', '2030-03-04 08:40Z')$q$, f),
    '23P01', null, 'booking whose buffer runs into the next appointment is rejected');

  b := tests.book(f, 'staff_a', 'service_short', 'client_2', '2030-03-04 10:15Z');
  perform tests.ok(b.id is not null, 'booking right after the buffer is accepted');
  b := tests.book(f, 'staff_a', 'service_short', 'client_2', '2030-03-04 08:15Z');
  perform tests.ok(b.id is not null, 'booking ending (incl. buffer) exactly at the next start is accepted');

  b := tests.book(f, 'staff_b', 'service_long', 'client_2', '2030-03-04 09:00Z');
  perform tests.ok(b.id is not null, 'different staff can be booked for the same time');

  -- cancelled appointments stop blocking
  perform public.cancel_appointment(a.id, 'staff', 'user_test', 'test');
  b := tests.book(f, 'staff_a', 'service_long', 'client_2', '2030-03-04 09:00Z');
  perform tests.ok(b.id is not null, 'a cancelled appointment does not block its slot');
end
$$;

-- --------------------------------------------------------- no-buffer [) ends
do $$
declare
  g jsonb := (select v from g);
  a public.appointments;
  b public.appointments;
begin
  a := tests.book(g, 'staff_a', 'service_long', 'client_1', '2030-03-04 09:00Z');
  perform tests.eq(a.blocked, a.slot, 'without buffer blocked = slot');
  b := tests.book(g, 'staff_a', 'service_long', 'client_2', '2030-03-04 10:00Z');
  perform tests.ok(b.id is not null, 'back-to-back appointments ([) ranges) are allowed');
end
$$;

-- ------------------------------------------------------------- idempotency
do $$
declare
  f jsonb := (select v from f);
  g jsonb := (select v from g);
  a public.appointments;
  b public.appointments;
begin
  a := tests.book(f, 'staff_b', 'service_long', 'client_1', '2030-03-05 09:00Z', 'idem-key-1');
  b := tests.book(f, 'staff_b', 'service_long', 'client_1', '2030-03-05 09:00Z', 'idem-key-1');
  perform tests.eq(b.id, a.id, 'same idempotency key returns the same appointment');
  perform tests.eq(b.updated_at, a.updated_at, 'replay returns the row unchanged');
  -- even if the replayed arguments differ, the original row comes back
  b := tests.book(f, 'staff_b', 'service_long', 'client_2', '2030-03-05 15:00Z', 'idem-key-1');
  perform tests.eq(b.id, a.id, 'replay with different arguments still returns the original row');
  perform tests.eq((select count(*) from public.appointments where idempotency_key = 'idem-key-1')::int, 1,
    'only one appointment exists for the key');
  perform tests.eq((select count(*) from public.appointment_events where appointment_id = a.id and type = 'created')::int, 1,
    'only one created event for an idempotent replay');

  perform tests.throws(format($q$select tests.book(%L::jsonb, 'staff_a', 'service_long', 'client_1', '2030-03-05 09:00Z', 'idem-key-1')$q$, g),
    'P0001', 'RULE:IDEMPOTENCY_KEY_REUSED:%', 'key used by another business raises RULE:IDEMPOTENCY_KEY_REUSED');
end
$$;

-- ------------------------------------------------------------- rule errors
do $$
declare
  f jsonb := (select v from f);
  g jsonb := (select v from g);
begin
  perform tests.throws(format($q$select tests.book(%L::jsonb, 'staff_b', 'service_short', 'client_1', '2030-03-06 09:00Z')$q$, f),
    'P0001', 'RULE:STAFF_NOT_QUALIFIED:%', 'unqualified staff → RULE:STAFF_NOT_QUALIFIED');
  perform tests.throws(format($q$select tests.book(%L::jsonb, 'staff_a', 'service_off', 'client_1', '2030-03-06 09:00Z')$q$, f),
    'P0001', 'RULE:SERVICE_INACTIVE:%', 'inactive service → RULE:SERVICE_INACTIVE');
  perform tests.throws(format($q$select tests.book(%L::jsonb, 'staff_a', 'service_long', 'client_blocked', '2030-03-06 09:00Z')$q$, f),
    'P0001', 'RULE:CLIENT_BLOCKED:%', 'blocked client → RULE:CLIENT_BLOCKED');
  perform tests.throws(format($q$select tests.book(%L::jsonb, 'staff_off', 'service_long', 'client_1', '2030-03-06 09:00Z')$q$, f),
    'P0001', 'RULE:STAFF_INACTIVE:%', 'inactive staff → RULE:STAFF_INACTIVE');
  perform tests.throws(format($q$select tests.book(%L::jsonb, 'staff_leave', 'service_long', 'client_1', '2030-03-06 09:00Z')$q$, f),
    'P0001', 'RULE:STAFF_INACTIVE:%not accepting%', 'staff not accepting bookings → RULE:STAFF_INACTIVE');

  -- NOT_FOUND (P0002), incl. entities of another business
  perform tests.throws(format($q$select public.create_appointment(%L, %L, %L, %L, '2030-03-06 09:00Z', 'app', null, 'staff', 'u')$q$,
      f->>'business', f->>'client_1', f->>'staff_a', gen_random_uuid()),
    'P0002', 'service not found', 'unknown service → P0002');
  perform tests.throws(format($q$select public.create_appointment(%L, %L, %L, %L, '2030-03-06 09:00Z', 'app', null, 'staff', 'u')$q$,
      f->>'business', f->>'client_1', g->>'staff_a', f->>'service_long'),
    'P0002', 'staff not found', 'staff of another business → P0002');
  perform tests.throws(format($q$select public.create_appointment(%L, %L, %L, %L, '2030-03-06 09:00Z', 'app', null, 'staff', 'u')$q$,
      f->>'business', g->>'client_1', f->>'staff_a', f->>'service_long'),
    'P0002', 'client not found', 'client of another business → P0002');
  perform tests.throws(format($q$select public.create_appointment(%L, %L, %L, %L, '2030-03-06 09:00Z', 'app', null, 'staff', 'u')$q$,
      gen_random_uuid(), f->>'client_1', f->>'staff_a', f->>'service_long'),
    'P0002', 'business not found', 'unknown business → P0002');
end
$$;

-- ---------------------------------------------------- created event + notes
do $$
declare
  f jsonb := (select v from f);
  a public.appointments;
  e public.appointment_events;
begin
  a := public.create_appointment((f->>'business')::uuid, (f->>'client_1')::uuid, (f->>'staff_a')::uuid,
         (f->>'service_short')::uuid, '2030-03-07 12:00Z', 'whatsapp', null, 'customer', 'client-actor', 'Window seat');
  perform tests.eq(a.notes, 'Window seat', 'notes stored');
  perform tests.ok(a.idempotency_key is null, 'idempotency key is optional');
  select * into e from public.appointment_events where appointment_id = a.id;
  perform tests.eq(e.type::text, 'created', 'created event written');
  perform tests.eq(e.actor::text, 'customer', 'event actor recorded');
  perform tests.eq(e.actor_id, 'client-actor', 'event actor_id recorded');
  perform tests.eq(e.payload ->> 'starts_at', '2030-03-07T12:00:00.000Z', 'event payload has ISO UTC starts_at');
  perform tests.eq(e.business_id, a.business_id, 'event carries business_id');
end
$$;

rollback;
