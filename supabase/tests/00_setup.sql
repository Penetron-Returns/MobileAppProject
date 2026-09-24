-- =============================================================================
-- Test helpers (plain SQL, no pgTAP). Loaded first by scripts/db/test.sh.
-- Each later file runs in its own transaction and rolls back.
--   tests.ok(cond, description)              raise unless cond is true
--   tests.eq(actual, expected, description)  compare as text
--   tests.throws(sql, sqlstate, pattern, d)  expect an error (message ILIKE pattern)
--   tests.fixture(org_id)                    a small business → jsonb of ids
--   tests.as_member(claims) / tests.as_anon() / tests.as_admin()
-- =============================================================================
drop schema if exists tests cascade;
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create function tests.ok(p_cond boolean, p_description text)
returns void language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'not ok - %', p_description;
  end if;
  raise notice 'ok - %', p_description;
end;
$$;

create function tests.eq(p_actual anyelement, p_expected anyelement, p_description text)
returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'not ok - % (expected %, got %)', p_description, p_expected, p_actual;
  end if;
  raise notice 'ok - %', p_description;
end;
$$;

-- Runs p_sql and expects it to fail with p_sqlstate (and, if given, a message
-- matching the ILIKE pattern). Runs inside a subtransaction.
create function tests.throws(p_sql text, p_sqlstate text, p_pattern text, p_description text)
returns void language plpgsql as $$
declare
  v_state text;
  v_msg   text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if v_state <> p_sqlstate then
      raise exception 'not ok - % (expected SQLSTATE %, got %: %)', p_description, p_sqlstate, v_state, v_msg;
    end if;
    if p_pattern is not null and v_msg not ilike p_pattern then
      raise exception 'not ok - % (message "%" does not match "%")', p_description, v_msg, p_pattern;
    end if;
    raise notice 'ok - %', p_description;
    return;
  end;
  raise exception 'not ok - % (expected SQLSTATE %, but no error)', p_description, p_sqlstate;
end;
$$;

-- Business with:
--   staff_a (all services), staff_b (service_long only), staff_off (inactive),
--   staff_leave (active, not accepting bookings)
--   service_long 60 min R500, service_short 30 min R250, service_off (inactive)
--   client_1, client_2, client_blocked
create function tests.fixture(p_org text, p_buffer integer default 0)
returns jsonb language plpgsql as $$
declare
  v_business uuid := gen_random_uuid();
  v jsonb;
begin
  insert into public.businesses (id, clerk_org_id, name, slug, booking_rules)
  values (v_business, p_org, 'Test ' || p_org, 't-' || replace(lower(p_org), '_', '-'),
          jsonb_build_object('lead_time_minutes', 60, 'cancellation_window_minutes', 1440,
                             'buffer_minutes', p_buffer, 'slot_interval_minutes', 15,
                             'booking_horizon_days', 60, 'reminder_offsets_minutes', jsonb_build_array(1440, 120),
                             'allow_staff_selection', true));

  v := jsonb_build_object(
    'business',       v_business,
    'staff_a',        gen_random_uuid(), 'staff_b',       gen_random_uuid(),
    'staff_off',      gen_random_uuid(), 'staff_leave',   gen_random_uuid(),
    'service_long',   gen_random_uuid(), 'service_short', gen_random_uuid(),
    'service_off',    gen_random_uuid(),
    'client_1',       gen_random_uuid(), 'client_2',      gen_random_uuid(),
    'client_blocked', gen_random_uuid());

  insert into public.staff (id, business_id, name, is_active, accepts_bookings, sort_order) values
    ((v->>'staff_a')::uuid,     v_business, 'Staff A',     true,  true,  1),
    ((v->>'staff_b')::uuid,     v_business, 'Staff B',     true,  true,  2),
    ((v->>'staff_off')::uuid,   v_business, 'Staff Off',   false, true,  3),
    ((v->>'staff_leave')::uuid, v_business, 'Staff Leave', true,  false, 4);

  insert into public.services (id, business_id, name, duration_minutes, price_cents, is_active) values
    ((v->>'service_long')::uuid,  v_business, 'Long',  60, 50000, true),
    ((v->>'service_short')::uuid, v_business, 'Short', 30, 25000, true),
    ((v->>'service_off')::uuid,   v_business, 'Off',   30, 10000, false);

  insert into public.staff_services (business_id, staff_id, service_id) values
    (v_business, (v->>'staff_a')::uuid,     (v->>'service_long')::uuid),
    (v_business, (v->>'staff_a')::uuid,     (v->>'service_short')::uuid),
    (v_business, (v->>'staff_a')::uuid,     (v->>'service_off')::uuid),
    (v_business, (v->>'staff_b')::uuid,     (v->>'service_long')::uuid),
    (v_business, (v->>'staff_off')::uuid,   (v->>'service_long')::uuid),
    (v_business, (v->>'staff_leave')::uuid, (v->>'service_long')::uuid);

  insert into public.clients (id, business_id, phone_e164, name, is_blocked) values
    ((v->>'client_1')::uuid,       v_business, '+27820000001', 'Client One', false),
    ((v->>'client_2')::uuid,       v_business, '+27820000002', 'Client Two', false),
    ((v->>'client_blocked')::uuid, v_business, '+27820000003', 'Client Blocked', true);

  return v;
end;
$$;

-- Books an appointment through the RPC with sensible defaults.
create function tests.book(
  f jsonb, p_staff text, p_service text, p_client text, p_starts_at timestamptz,
  p_key text default null
) returns public.appointments language sql as $$
  select * from public.create_appointment(
    (f->>'business')::uuid, (f->>p_client)::uuid, (f->>p_staff)::uuid, (f->>p_service)::uuid,
    p_starts_at, 'app', coalesce(p_key, gen_random_uuid()::text), 'staff', 'user_test', null);
$$;

-- Role switching for RLS tests (transaction-local).
create function tests.as_member(p_claims jsonb) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function tests.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end;
$$;

create function tests.as_admin() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

do $$ begin raise notice 'ok - test helpers installed'; end $$;
