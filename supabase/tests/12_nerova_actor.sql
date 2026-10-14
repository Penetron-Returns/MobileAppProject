-- Nerova connector attribution: source 'nerova' and actor 'nerova' are accepted by the
-- appointment RPCs and recorded on appointment_events.
begin;

create temporary table f on commit drop as select tests.fixture('org_nerova') as v;

do $$
declare
  f jsonb := (select v from f);
  a public.appointments;
  e public.appointment_events;
begin
  perform tests.ok(exists (select 1 from pg_enum pe join pg_type t on t.oid = pe.enumtypid
                             where t.typname = 'appointment_source' and pe.enumlabel = 'nerova'),
                   'appointment_source has nerova');
  perform tests.ok(exists (select 1 from pg_enum pe join pg_type t on t.oid = pe.enumtypid
                             where t.typname = 'actor_type' and pe.enumlabel = 'nerova'),
                   'actor_type has nerova');

  a := public.create_appointment(
    (f->>'business')::uuid, (f->>'client_1')::uuid, (f->>'staff_a')::uuid, (f->>'service_long')::uuid,
    '2030-05-01 09:00Z', 'nerova', 'nerova:key-1', 'nerova', 'nerova', null);
  perform tests.eq(a.source::text, 'nerova', 'appointment source is nerova');
  select * into e from public.appointment_events where appointment_id = a.id and type = 'created';
  perform tests.eq(e.actor::text, 'nerova', 'created event actor is nerova');
  perform tests.eq(e.actor_id, 'nerova', 'created event actor_id is the connection');

  a := public.cancel_appointment(p_appointment_id => a.id, p_actor => 'nerova', p_actor_id => 'nerova', p_reason => 'asked via Pip');
  select * into e from public.appointment_events where appointment_id = a.id and type = 'cancelled';
  perform tests.eq(e.actor::text, 'nerova', 'cancelled event actor is nerova');
end
$$;

rollback;
