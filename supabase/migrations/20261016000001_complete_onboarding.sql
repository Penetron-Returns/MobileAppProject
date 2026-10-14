-- Atomic, idempotent first-run setup.
--
-- Onboarding used to apply hours, team and services as separate statements, so
-- a failure part-way (or two concurrent submits) left duplicate staff/services
-- and no way to tell whether setup had finished. complete_onboarding does the
-- whole thing in one transaction under a row lock on the business and writes the
-- completion marker (businesses.onboarded_at) last, so a retry either finishes
-- the job or is a no-op.

alter table public.businesses add column if not exists onboarded_at timestamptz;

-- Businesses that were set up before the marker existed count as onboarded.
update public.businesses b
   set onboarded_at = b.created_at
 where b.onboarded_at is null
   and (exists (select 1 from public.business_hours h where h.business_id = b.id)
        or exists (select 1 from public.services s where s.business_id = b.id));

-- complete_onboarding(p_business_id, p_user_id, p_owner_name, p_hours, p_team, p_services)
--   p_hours    [{weekday, opens_at, closes_at}]
--   p_team     [{name, title?}]                   extra staff besides the owner
--   p_services [{name, duration_minutes, price_cents}]  offered by owner + team
-- Returns true when it applied the setup, false when it was already complete.
create or replace function public.complete_onboarding(
  p_business_id uuid,
  p_user_id     text,
  p_owner_name  text,
  p_hours       jsonb,
  p_team        jsonb,
  p_services    jsonb
)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_done     timestamptz;
  v_owner    uuid;
  v_staff    uuid[];
  v_member   record;
  v_service  record;
  v_id       uuid;
begin
  if p_hours is null or jsonb_typeof(p_hours) <> 'array'
     or p_team is null or jsonb_typeof(p_team) <> 'array'
     or p_services is null or jsonb_typeof(p_services) <> 'array' then
    perform private.raise_rule('INVALID_INPUT', 'hours, team and services must be JSON arrays');
  end if;

  -- serialise concurrent submits for the same business
  select b.onboarded_at into v_done from public.businesses b where b.id = p_business_id for update;
  if not found then
    perform private.raise_not_found('business');
  end if;
  if v_done is not null then
    return false;
  end if;

  select s.id into v_owner from public.staff s
   where s.business_id = p_business_id and s.user_id = p_user_id
   order by s.created_at, s.id limit 1;
  if v_owner is null then
    insert into public.staff (business_id, user_id, name, sort_order)
    values (p_business_id, p_user_id, coalesce(nullif(btrim(p_owner_name), ''), 'Owner'), 0)
    returning id into v_owner;
  end if;
  v_staff := array[v_owner];

  perform 1 from public.replace_business_hours(p_business_id, p_hours);

  for v_member in
    select t.name, t.title, t.ord
      from jsonb_to_recordset(p_team) with ordinality as t(name text, title text, ord int)
     order by t.ord
  loop
    insert into public.staff (business_id, name, title, sort_order)
    values (p_business_id, v_member.name, v_member.title, v_member.ord)
    returning id into v_id;
    v_staff := v_staff || v_id;
  end loop;

  for v_service in
    select x.name, x.duration_minutes, x.price_cents, x.ord
      from jsonb_to_recordset(p_services) with ordinality as x(name text, duration_minutes int, price_cents int, ord int)
     order by x.ord
  loop
    insert into public.services (business_id, name, duration_minutes, price_cents, sort_order)
    values (p_business_id, v_service.name, v_service.duration_minutes, v_service.price_cents, v_service.ord - 1)
    returning id into v_id;
    insert into public.staff_services (business_id, staff_id, service_id)
    select p_business_id, m, v_id from unnest(v_staff) as m;
  end loop;

  update public.businesses set onboarded_at = now() where id = p_business_id;
  return true;
end;
$$;

revoke all on function public.complete_onboarding(uuid, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.complete_onboarding(uuid, text, text, jsonb, jsonb, jsonb) to service_role;
