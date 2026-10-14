-- =============================================================================
-- 0003 · Private helpers, updated_at triggers, audit trigger
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tenant resolution from the Clerk session token (BUILD_PLAN §3 "RLS").
-- Clerk v1 tokens carry `org_id`; v2 tokens carry `o.id`.
-- -----------------------------------------------------------------------------
create or replace function private.current_org_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'org_id', auth.jwt() -> 'o' ->> 'id');
$$;

-- security definer: businesses has RLS whose policy calls this function, so it
-- must read businesses without going through RLS (no recursion).
create or replace function private.current_business_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id
  from public.businesses b
  where b.clerk_org_id = private.current_org_id()
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- ISO-8601 UTC rendering that does not depend on the session TimeZone, e.g.
-- 2026-09-30T09:00:00.000Z (the API's instant format, BUILD_PLAN §2).
-- -----------------------------------------------------------------------------
create or replace function private.iso_utc(p_ts timestamptz)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select to_char(p_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

-- -----------------------------------------------------------------------------
-- Request context for the audit trigger.
-- Resolution order for each value:
--   1. transaction-local GUCs set by public.set_request_context()
--      (`app.actor_id`, `app.request_id`, optionally `app.actor_type`)
--   2. PostgREST request headers (`x-actor-id`, `x-request-id`, `x-actor-type`),
--      which the API can attach per call with `.setHeader()` — this is what makes
--      auditing work for plain table writes, since every PostgREST call is its own
--      transaction
--   3. actor defaults to `system`
-- -----------------------------------------------------------------------------
create or replace function private.request_context(
  out actor public.actor_type,
  out actor_id text,
  out request_id text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_headers jsonb;
  v_type text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;

  actor_id   := coalesce(nullif(current_setting('app.actor_id', true), ''),
                         nullif(v_headers ->> 'x-actor-id', ''));
  request_id := coalesce(nullif(current_setting('app.request_id', true), ''),
                         nullif(v_headers ->> 'x-request-id', ''));
  v_type     := coalesce(nullif(current_setting('app.actor_type', true), ''),
                         nullif(v_headers ->> 'x-actor-type', ''));

  if v_type in ('customer', 'staff', 'system') then
    actor := v_type::public.actor_type;
  elsif actor_id is not null then
    actor := 'staff';
  else
    actor := 'system';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'businesses', 'users', 'staff', 'services', 'business_hours', 'availability_rules',
    'availability_overrides', 'clients', 'client_notes', 'appointments', 'whatsapp_accounts',
    'message_templates', 'conversations', 'messages', 'webhook_events', 'escalations',
    'idempotency_keys', 'booking_attempts', 'device_push_tokens'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function private.set_updated_at()', t);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- Generic audit trigger (BUILD_PLAN §3 audit_log).
-- Trigger arguments = extra column names to ignore when diffing updates
-- (updated_at is always ignored). An update that only touches ignored columns
-- writes no audit row.
-- diff: insert → new row, delete → old row, update → {col: {old, new}} for the
-- changed columns only.
-- -----------------------------------------------------------------------------
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ignore   text[] := array['updated_at'];
  v_old      jsonb;
  v_new      jsonb;
  v_row      jsonb;
  v_diff     jsonb;
  v_ctx      record;
  v_business uuid;
  v_entity   text;
begin
  if tg_nargs > 0 then
    v_ignore := v_ignore || tg_argv;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('UPDATE', 'INSERT') then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('old', v_old -> n.key, 'new', n.value))
      into v_diff
      from jsonb_each(v_new) as n
     where not (n.key = any (v_ignore))
       and (v_old -> n.key) is distinct from n.value;
    if v_diff is null then
      return null; -- nothing worth auditing changed
    end if;
  elsif tg_op = 'INSERT' then
    v_diff := v_new - v_ignore;
  else
    v_diff := v_old - v_ignore;
  end if;

  if tg_table_name = 'businesses' then
    v_business := (v_row ->> 'id')::uuid;
  else
    v_business := (v_row ->> 'business_id')::uuid;
  end if;

  v_entity := coalesce(
    v_row ->> 'id',
    case when v_row ? 'staff_id' and v_row ? 'service_id'
         then (v_row ->> 'staff_id') || ':' || (v_row ->> 'service_id') end
  );

  select * into v_ctx from private.request_context();

  insert into public.audit_log (business_id, actor, actor_id, action, entity, entity_id, diff, request_id)
  values (v_business, v_ctx.actor, v_ctx.actor_id, lower(tg_op), tg_table_name, v_entity, v_diff, v_ctx.request_id);

  return null;
end;
$$;

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('businesses',             array[]::text[]),
      ('services',               array[]::text[]),
      ('staff',                  array[]::text[]),
      ('staff_services',         array[]::text[]),
      ('business_hours',         array[]::text[]),
      ('availability_rules',     array[]::text[]),
      ('availability_overrides', array[]::text[]),
      -- last_seen_at is bumped on every inbound WhatsApp message; not config.
      ('clients',                array['last_seen_at'])
    ) as v(name, ignore_cols)
  loop
    execute format('drop trigger if exists audit_row_change on public.%I', t.name);
    execute format(
      'create trigger audit_row_change after insert or update or delete on public.%I
         for each row execute function private.audit_row_change(%s)',
      t.name,
      coalesce((select string_agg(quote_literal(c), ', ') from unnest(t.ignore_cols) as c), '')
    );
  end loop;
end
$$;
