-- audit_log trigger: actor resolution, compact diffs, ignored columns.
begin;

create temporary table f on commit drop as select tests.fixture('org_audit') as v;

do $$
declare
  f jsonb := (select v from f);
  b uuid := (f->>'business')::uuid;
  r public.audit_log;
begin
  -- inserts from the fixture were audited as system
  select * into r from public.audit_log where business_id = b and entity = 'services' and entity_id = f->>'service_long' and action = 'insert';
  perform tests.eq(r.actor::text, 'system', 'no context → actor system');
  perform tests.ok(r.actor_id is null and r.request_id is null, 'no context → null actor_id / request_id');
  perform tests.eq(r.business_id, b, 'audit row carries business_id');
  perform tests.eq(r.diff ->> 'name', 'Long', 'insert diff holds the new row');
  perform tests.ok(not (r.diff ? 'updated_at'), 'updated_at is not part of the diff');

  -- set_request_context → staff actor with id + request id
  perform public.set_request_context('user_owner_1', 'req-123');
  update public.services set price_cents = 55000, name = 'Longer' where id = (f->>'service_long')::uuid;
  select * into r from public.audit_log where business_id = b and entity = 'services' and action = 'update' order by id desc limit 1;
  perform tests.eq(r.actor::text, 'staff', 'app.actor_id set → actor staff');
  perform tests.eq(r.actor_id, 'user_owner_1', 'actor_id from app.actor_id');
  perform tests.eq(r.request_id, 'req-123', 'request_id from app.request_id');
  perform tests.eq(r.entity_id, f->>'service_long', 'entity_id = row id');
  perform tests.eq(r.diff, '{"name": {"old": "Long", "new": "Longer"}, "price_cents": {"old": 50000, "new": 55000}}'::jsonb,
                   'update diff contains only changed columns');

  -- no-op update → no audit row
  update public.services set price_cents = 55000 where id = (f->>'service_long')::uuid;
  perform tests.eq((select count(*) from public.audit_log where business_id = b and entity = 'services' and action = 'update')::int, 1,
                   'an update that changes nothing is not audited');

  -- clients.last_seen_at is ignored
  perform public.upsert_client_by_phone(b, '+27820000001');
  perform tests.eq((select count(*) from public.audit_log where business_id = b and entity = 'clients' and action = 'update')::int, 0,
                   'last_seen_at-only updates are not audited');
  update public.clients set is_blocked = true, last_seen_at = now() - interval '1 day' where id = (f->>'client_1')::uuid;
  select * into r from public.audit_log where business_id = b and entity = 'clients' and action = 'update';
  perform tests.eq(r.diff, '{"is_blocked": {"old": false, "new": true}}'::jsonb, 'ignored columns are stripped from diffs');

  -- delete + composite-key entity id
  delete from public.staff_services where staff_id = (f->>'staff_b')::uuid and service_id = (f->>'service_long')::uuid;
  select * into r from public.audit_log where business_id = b and entity = 'staff_services' and action = 'delete';
  perform tests.eq(r.entity_id, (f->>'staff_b') || ':' || (f->>'service_long'), 'staff_services entity_id = staff:service');
  perform tests.eq(r.diff ->> 'staff_id', f->>'staff_b', 'delete diff holds the old row');

  -- businesses audit uses id as business_id
  update public.businesses set name = 'Renamed' where id = b;
  select * into r from public.audit_log where business_id = b and entity = 'businesses' and action = 'update';
  perform tests.eq(r.business_id, b, 'businesses rows are attributed to themselves');

  -- explicit actor type
  perform set_config('app.actor_type', 'customer', true);
  update public.clients set name = 'Via WhatsApp' where id = (f->>'client_2')::uuid;
  select * into r from public.audit_log where business_id = b and entity = 'clients' and action = 'update' order by id desc limit 1;
  perform tests.eq(r.actor::text, 'customer', 'app.actor_type overrides the actor type');
  perform set_config('app.actor_type', '', true);

  -- PostgREST request headers are the fallback (x-actor-id / x-request-id)
  perform set_config('app.actor_id', '', true);
  perform set_config('app.request_id', '', true);
  perform set_config('request.headers', '{"x-actor-id": "user_hdr", "x-request-id": "req-hdr"}', true);
  update public.staff set title = 'Lead' where id = (f->>'staff_a')::uuid;
  select * into r from public.audit_log where business_id = b and entity = 'staff' and action = 'update';
  perform tests.eq(r.actor_id, 'user_hdr', 'actor_id falls back to x-actor-id header');
  perform tests.eq(r.request_id, 'req-hdr', 'request_id falls back to x-request-id header');
  perform tests.eq(r.actor::text, 'staff', 'header actor → staff');

  perform set_config('request.headers', 'not json', true);
  update public.staff set title = 'Lead 2' where id = (f->>'staff_a')::uuid;
  select * into r from public.audit_log where business_id = b and entity = 'staff' and action = 'update' order by id desc limit 1;
  perform tests.eq(r.actor::text, 'system', 'malformed headers are ignored');

  -- tables that are not audited
  perform tests.eq((select count(*) from public.audit_log where entity in ('appointments', 'messages', 'whatsapp_accounts'))::int, 0,
                   'appointments/messages/whatsapp_accounts are not in audit_log');
end
$$;

-- the audited set is exactly the §3 list
do $$
begin
  perform tests.eq(
    (select array_agg(c.relname::text order by c.relname)
       from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where t.tgname = 'audit_row_change'),
    array['availability_overrides', 'availability_rules', 'business_hours', 'businesses', 'calendar_connections', 'clients',
          'services', 'staff', 'staff_services'],
    'audit trigger installed on exactly the configured tables');
end
$$;

rollback;
