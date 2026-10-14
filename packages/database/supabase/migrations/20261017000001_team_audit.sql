-- Team management: audit entries for membership/role/invitation changes (these
-- live in Clerk, so the row-level audit triggers cannot see them) and a unique
-- login-to-staff link so concurrent first requests cannot create two staff rows.

-- 1. record_audit_event: service-role-only audit_log insert for changes made outside Postgres tables.
create or replace function public.record_audit_event(
  p_business_id uuid,
  p_actor_id    text,
  p_action      text,
  p_entity      text,
  p_entity_id   text,
  p_diff        jsonb default null,
  p_request_id  text default null
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.audit_log (business_id, actor, actor_id, action, entity, entity_id, diff, request_id)
  values (p_business_id, case when nullif(p_actor_id, '') is null then 'system'::public.actor_type else 'staff'::public.actor_type end,
          nullif(p_actor_id, ''), p_action, p_entity, p_entity_id, p_diff, p_request_id);
$$;

revoke all on function public.record_audit_event(uuid, text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.record_audit_event(uuid, text, text, text, text, jsonb, text) to service_role;

-- 2. One staff row per login per business. Keep the oldest link when old data already has duplicates.
update public.staff s
   set user_id = null
  from (
    select id, row_number() over (partition by business_id, user_id order by created_at, id) as rn
      from public.staff
     where user_id is not null
  ) d
 where s.id = d.id and d.rn > 1;

create unique index if not exists staff_business_user_key
  on public.staff (business_id, user_id)
  where user_id is not null;
