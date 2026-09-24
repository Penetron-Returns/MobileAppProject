-- RLS isolation, privileges, column grants, storage policies.
begin;

create temporary table fx (label text primary key, v jsonb) on commit drop;
grant select on fx to authenticated, anon;

-- Fill every business-scoped table for one business.
create function pg_temp.fill(p_org text) returns jsonb language plpgsql as $$
declare
  f jsonb := tests.fixture(p_org);
  b uuid := (f->>'business')::uuid;
  v_user text := 'user_' || p_org;
  v_wa uuid;
  v_conv uuid;
begin
  insert into public.users (id, business_id, role) values (v_user, b, 'owner'), ('colleague_' || p_org, b, 'staff');
  insert into public.business_hours (business_id, weekday, opens_at, closes_at) values (b, 1, '09:00', '17:00');
  insert into public.availability_rules (business_id, staff_id, weekday, start_time, end_time)
    values (b, (f->>'staff_a')::uuid, 1, '09:00', '12:00');
  insert into public.availability_overrides (business_id, date, is_closed) values (b, '2030-12-25', true);
  insert into public.client_notes (business_id, client_id, body) values (b, (f->>'client_1')::uuid, 'note');
  perform tests.book(f, 'staff_a', 'service_long', 'client_1', '2030-06-03 09:00Z');
  insert into public.whatsapp_accounts (business_id, waba_id, phone_number_id, access_token_ciphertext, status)
    values (b, 'waba_' || p_org, 'phone_' || p_org, 'v1:secret-ciphertext', 'live') returning id into v_wa;
  insert into public.message_templates (business_id, whatsapp_account_id, name) values (b, v_wa, 'booking_confirmation');
  insert into public.conversations (business_id, client_id) values (b, (f->>'client_1')::uuid) returning id into v_conv;
  insert into public.messages (business_id, conversation_id, direction, type, body, status)
    values (b, v_conv, 'in', 'text', '{"text": "hi"}', 'received');
  insert into public.escalations (business_id, conversation_id, client_id, reason)
    values (b, v_conv, (f->>'client_1')::uuid, 'customer_requested');
  insert into public.booking_attempts (business_id, channel) values (b, 'web');
  insert into public.device_push_tokens (business_id, user_id, token, platform) values
    (b, v_user, 'ExponentPushToken[' || p_org || ']', 'ios'),
    (b, 'colleague_' || p_org, 'ExponentPushToken[colleague-' || p_org || ']', 'android');
  insert into public.webhook_events (source, event_key, whatsapp_account_id, payload)
    values ('whatsapp', 'evt_' || p_org, v_wa, '{}');
  insert into public.idempotency_keys (key, business_id, endpoint, request_hash)
    values ('idem_' || p_org, b, 'POST /v1/x', 'hash');
  return f;
end;
$$;

insert into fx values ('a', pg_temp.fill('org_rls_a')), ('b', pg_temp.fill('org_rls_b'));

-- ------------------------------------------------------------ static checks
do $$
declare
  r record;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  loop
    perform tests.ok((select relrowsecurity from pg_class where oid = ('public.' || r.relname)::regclass),
                     format('RLS enabled on %s', r.relname));
  end loop;

  perform tests.eq((select count(*) from pg_policies where schemaname = 'public' and cmd <> 'SELECT')::int, 0,
                   'no insert/update/delete policies in public');
  perform tests.eq((select count(*) from pg_policies where schemaname = 'public' and not (roles = '{authenticated}'))::int, 0,
                   'every public policy targets authenticated only');
  perform tests.eq((select count(*) from pg_policies where schemaname = 'public'
                     and tablename in ('webhook_events', 'idempotency_keys'))::int, 0,
                   'webhook_events / idempotency_keys have no policies');

  -- function privileges
  for r in
    select p.oid::regprocedure as fn, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  loop
    perform tests.ok(not has_function_privilege('anon', r.fn, 'execute'), format('anon cannot execute %s', r.proname));
    perform tests.ok(has_function_privilege('authenticated', r.fn, 'execute') = (r.proname = 'dashboard_summary'),
                     format('authenticated execute on %s only if dashboard_summary', r.proname));
    perform tests.ok(has_function_privilege('service_role', r.fn, 'execute'), format('service_role can execute %s', r.proname));
  end loop;

  perform tests.ok(not has_table_privilege('authenticated', 'public.whatsapp_accounts', 'select'),
                   'authenticated has no table-wide select on whatsapp_accounts');
  perform tests.ok(not has_column_privilege('authenticated', 'public.whatsapp_accounts', 'access_token_ciphertext', 'select'),
                   'authenticated cannot select access_token_ciphertext');
  perform tests.ok(has_column_privilege('authenticated', 'public.whatsapp_accounts', 'status', 'select'),
                   'authenticated can select whatsapp_accounts.status');
  perform tests.ok(has_table_privilege('service_role', 'public.whatsapp_accounts', 'select, insert, update, delete'),
                   'service_role has full access to whatsapp_accounts');
end
$$;

-- ------------------------------------------------ isolation per Clerk claims
create function pg_temp.check_isolation(p_label text, p_other text) returns void language plpgsql as $$
declare
  v_me    uuid := ((select v from fx where label = p_label) ->> 'business')::uuid;
  v_other uuid := ((select v from fx where label = p_other) ->> 'business')::uuid;
  t text;
  v_mine int;
  v_total int;
begin
  foreach t in array array['users', 'staff', 'services', 'staff_services', 'business_hours', 'availability_rules',
    'availability_overrides', 'clients', 'client_notes', 'appointments', 'appointment_events', 'audit_log',
    'message_templates', 'conversations', 'messages', 'escalations', 'booking_attempts', 'device_push_tokens']
  loop
    execute format('select count(*) filter (where business_id = %L), count(*) from public.%I', v_me, t)
      into v_mine, v_total;
    perform tests.ok(v_mine > 0 and v_mine = v_total, format('[%s] sees only its own %s (%s rows)', p_label, t, v_mine));
  end loop;

  select count(*) filter (where id = v_me), count(*) into v_mine, v_total from public.businesses;
  perform tests.ok(v_mine = 1 and v_total = 1, format('[%s] sees only its own business', p_label));

  select count(*) filter (where business_id = v_me), count(*) into v_mine, v_total
    from (select id, business_id, status from public.whatsapp_accounts) w;
  perform tests.ok(v_mine = 1 and v_total = 1, format('[%s] sees only its own whatsapp account (safe columns)', p_label));

  perform tests.eq((select count(*) from public.device_push_tokens where user_id <> current_setting('request.jwt.claims')::jsonb ->> 'sub')::int,
                   0, format('[%s] sees only its own push tokens', p_label));
  perform tests.eq((select count(*) from public.clients where business_id = v_other)::int, 0,
                   format('[%s] filtering for the other business returns nothing', p_label));
end;
$$;
grant execute on function pg_temp.check_isolation(text, text) to authenticated;

-- Clerk session token v1: org_id
select tests.as_member('{"sub": "user_org_rls_a", "org_id": "org_rls_a", "org_role": "org:admin", "role": "authenticated"}');
select pg_temp.check_isolation('a', 'b');

-- Clerk session token v2: o.id
select tests.as_member('{"sub": "user_org_rls_b", "o": {"id": "org_rls_b", "rol": "admin"}, "role": "authenticated", "v": 2}');
select pg_temp.check_isolation('b', 'a');

-- ------------------------------------------------ authenticated is read-only
select tests.as_member('{"sub": "user_org_rls_a", "org_id": "org_rls_a"}');
do $$
declare
  f jsonb := (select v from fx where label = 'a');
begin
  perform tests.throws(format($q$insert into public.clients (business_id, phone_e164) values (%L, '+27829999999')$q$, f->>'business'),
    '42501', null, 'authenticated cannot INSERT');
  perform tests.throws(format($q$update public.clients set name = 'x' where id = %L$q$, f->>'client_1'),
    '42501', null, 'authenticated cannot UPDATE');
  perform tests.throws(format($q$delete from public.client_notes where business_id = %L$q$, f->>'business'),
    '42501', null, 'authenticated cannot DELETE');
  perform tests.throws(format($q$update public.appointments set status = 'cancelled' where business_id = %L$q$, f->>'business'),
    '42501', null, 'authenticated cannot UPDATE appointments');
  perform tests.throws(format($q$update public.businesses set name = 'x' where id = %L$q$, f->>'business'),
    '42501', null, 'authenticated cannot UPDATE businesses');
  perform tests.throws($q$select access_token_ciphertext from public.whatsapp_accounts$q$,
    '42501', null, 'authenticated cannot select access_token_ciphertext');
  perform tests.throws($q$select * from public.whatsapp_accounts$q$,
    '42501', null, 'authenticated cannot select * from whatsapp_accounts');
  perform tests.throws($q$select count(*) from public.webhook_events$q$, '42501', null, 'authenticated cannot read webhook_events');
  perform tests.throws($q$select count(*) from public.idempotency_keys$q$, '42501', null, 'authenticated cannot read idempotency_keys');
  perform tests.throws(format($q$select public.create_appointment(%L, %L, %L, %L, now(), 'app', 'k', 'staff', 'u')$q$,
      f->>'business', f->>'client_1', f->>'staff_a', f->>'service_long'),
    '42501', null, 'authenticated cannot call create_appointment');
  perform tests.throws($q$select public.set_request_context('u', 'r')$q$, '42501', null, 'authenticated cannot call set_request_context');
  perform tests.throws($q$select private.invoke_cron_job('cleanup')$q$, '42501', null, 'authenticated cannot call private.invoke_cron_job');
  perform tests.throws($q$select * from tests.fixture('org_evil')$q$, '42501', null, 'authenticated cannot write via helper functions either');
end
$$;

-- -------------------------------------------- no org / unknown org: nothing
select tests.as_member('{"sub": "user_lonely", "role": "authenticated"}');
do $$
begin
  perform tests.eq((select count(*) from public.businesses)::int, 0, 'no org claim → no businesses');
  perform tests.eq((select count(*) from public.appointments)::int, 0, 'no org claim → no appointments');
end
$$;
select tests.as_member('{"sub": "user_x", "org_id": "org_does_not_exist"}');
do $$
begin
  perform tests.eq((select count(*) from public.clients)::int, 0, 'unlinked org → no clients');
end
$$;

-- ---------------------------------------------------------- anon: nothing
select tests.as_anon();
do $$
declare
  t text;
begin
  foreach t in array array['businesses', 'users', 'staff', 'services', 'staff_services', 'business_hours',
    'availability_rules', 'availability_overrides', 'clients', 'client_notes', 'appointments', 'appointment_events',
    'audit_log', 'whatsapp_accounts', 'message_templates', 'conversations', 'messages', 'webhook_events',
    'escalations', 'idempotency_keys', 'booking_attempts', 'device_push_tokens']
  loop
    perform tests.throws(format('select count(*) from public.%I', t), '42501', null, format('anon cannot read %s', t));
  end loop;
  perform tests.throws($q$insert into public.businesses (clerk_org_id, name, slug) values ('o', 'n', 's')$q$,
    '42501', null, 'anon cannot insert');
end
$$;

-- ---------------------------------------------------------------- storage
select tests.as_admin();
insert into storage.objects (bucket_id, name)
select 'logos', ((select v from fx where label = 'b') ->> 'business') || '/logo.png';

select tests.as_member('{"sub": "user_org_rls_a", "org_id": "org_rls_a"}');
do $$
declare
  a text := (select v from fx where label = 'a') ->> 'business';
  b text := (select v from fx where label = 'b') ->> 'business';
begin
  insert into storage.objects (bucket_id, name) values ('logos', a || '/logo.png');
  perform tests.ok(true, 'member can upload a logo under its own business folder');
  insert into storage.objects (bucket_id, name) values ('staff-photos', a || '/staff/emma.jpg');
  perform tests.ok(true, 'member can upload a staff photo under its own business folder');
  perform tests.throws(format($q$insert into storage.objects (bucket_id, name) values ('logos', %L)$q$, b || '/evil.png'),
    '42501', null, 'member cannot upload into another business folder');
  perform tests.throws($q$insert into storage.objects (bucket_id, name) values ('logos', 'logo.png')$q$,
    '42501', null, 'member cannot upload outside a business folder');
  perform tests.throws(format($q$insert into storage.objects (bucket_id, name) values ('whatsapp-media', %L)$q$, a || '/m.jpg'),
    '42501', null, 'member cannot upload to the private whatsapp-media bucket');
  perform tests.eq((select count(*) from storage.objects)::int, 2, 'member lists only its own business objects');
end
$$;

select tests.as_admin();
do $$
begin
  perform tests.eq((select array_agg(id::text order by id) from storage.buckets where public),
                   array['logos', 'staff-photos'], 'logos and staff-photos are public buckets');
  perform tests.ok(not (select public from storage.buckets where id = 'whatsapp-media'), 'whatsapp-media is private');
end
$$;

rollback;
