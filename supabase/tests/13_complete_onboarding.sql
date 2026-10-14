-- complete_onboarding: atomic, idempotent first-run setup with a completion marker.
begin;

create temporary table f on commit drop as select tests.fixture('org_onboard') as v;

do $$
declare
  f jsonb := (select v from f);
  b uuid := (f->>'business')::uuid;
  v_applied boolean;
  v_staff int;
  v_services int;
begin
  insert into public.users (id, business_id, role, display_name) values ('user_onboard', b, 'owner', 'Owner One');
  update public.businesses set onboarded_at = null where id = b;
  delete from public.business_hours where business_id = b;
  select count(*) into v_staff from public.staff where business_id = b;
  select count(*) into v_services from public.services where business_id = b;

  -- an invalid service rolls everything back, including the owner staff row and the marker
  perform tests.throws(format($q$select public.complete_onboarding(%L, 'user_onboard', 'Owner One',
      '[{"weekday": 1, "opens_at": "09:00", "closes_at": "17:00"}]',
      '[{"name": "Naledi"}]',
      '[{"name": "Bad", "duration_minutes": 0, "price_cents": 0}]')$q$, b),
    '23514', '%', 'invalid service rejected');
  perform tests.eq((select count(*) from public.staff where business_id = b)::int, v_staff, 'failure leaves staff untouched');
  perform tests.eq((select count(*) from public.business_hours where business_id = b)::int, 0, 'failure leaves hours untouched');
  perform tests.ok((select onboarded_at is null from public.businesses where id = b), 'failure leaves the marker unset');

  -- success applies hours, owner + team, services (qualified staff = owner + team) and sets the marker
  v_applied := public.complete_onboarding(b, 'user_onboard', 'Owner One',
    '[{"weekday": 1, "opens_at": "09:00", "closes_at": "17:00"}]',
    '[{"name": "Naledi", "title": "Stylist"}]',
    '[{"name": "Skin fade", "duration_minutes": 30, "price_cents": 18000}, {"name": "Beard trim", "duration_minutes": 20, "price_cents": 9000}]');
  perform tests.ok(v_applied, 'first call applies the setup');
  perform tests.eq((select count(*) from public.staff where business_id = b)::int, v_staff + 2, 'owner and one team member added');
  perform tests.eq((select count(*) from public.staff where business_id = b and user_id = 'user_onboard')::int, 1, 'one owner staff row');
  perform tests.eq((select count(*) from public.services where business_id = b)::int, v_services + 2, 'two services added');
  perform tests.eq((select count(*) from public.staff_services ss join public.services s on s.id = ss.service_id
                     where s.business_id = b and s.name in ('Skin fade', 'Beard trim'))::int, 4, 'both services offered by both staff');
  perform tests.eq((select count(*) from public.business_hours where business_id = b)::int, 1, 'hours applied');
  perform tests.ok((select onboarded_at is not null from public.businesses where id = b), 'marker written');

  -- a retry (or racing duplicate, serialised by the row lock) is a no-op
  v_applied := public.complete_onboarding(b, 'user_onboard', 'Owner One', '[]', '[{"name": "Dup"}]',
    '[{"name": "Dup", "duration_minutes": 10, "price_cents": 1}]');
  perform tests.ok(not v_applied, 'second call is a no-op');
  perform tests.eq((select count(*) from public.staff where business_id = b)::int, v_staff + 2, 'no duplicate staff');
  perform tests.eq((select count(*) from public.services where business_id = b and name = 'Dup')::int, 0, 'no duplicate services');

  perform tests.throws(format($q$select public.complete_onboarding(%L, 'u', 'n', '{}', '[]', '[]')$q$, b),
    'P0001', 'RULE:INVALID_INPUT:%', 'non-array input rejected');
  perform tests.throws(format($q$select public.complete_onboarding(%L, 'u', 'n', '[]', '[]', '[]')$q$, gen_random_uuid()),
    'P0002', 'business not found', 'unknown business -> P0002');

  -- privileges: service_role only
  perform tests.ok(has_function_privilege('service_role', 'public.complete_onboarding(uuid, text, text, jsonb, jsonb, jsonb)', 'execute'), 'service_role may execute');
  perform tests.ok(not has_function_privilege('authenticated', 'public.complete_onboarding(uuid, text, text, jsonb, jsonb, jsonb)', 'execute'), 'authenticated may not execute');
  perform tests.ok(not has_function_privilege('anon', 'public.complete_onboarding(uuid, text, text, jsonb, jsonb, jsonb)', 'execute'), 'anon may not execute');
end
$$;

rollback;
