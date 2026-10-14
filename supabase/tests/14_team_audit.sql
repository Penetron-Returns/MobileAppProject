-- record_audit_event + one staff row per login per business.
begin;

create temporary table f on commit drop as select tests.fixture('org_team') as v;

do $$
declare
  f jsonb := (select v from f);
  b uuid := (f->>'business')::uuid;
  r public.audit_log;
  v_staff uuid := (f->>'staff_b')::uuid;
begin
  perform public.record_audit_event(b, 'user_owner_1', 'update', 'team_member', 'user_x', '{"role": {"old": "staff", "new": "owner"}}', 'req-9');
  select * into r from public.audit_log where business_id = b and entity = 'team_member';
  perform tests.eq(r.actor::text, 'staff', 'audit event actor is staff');
  perform tests.eq(r.actor_id, 'user_owner_1', 'audit event keeps the actor id');
  perform tests.eq(r.request_id, 'req-9', 'audit event keeps the request id');
  perform tests.eq(r.diff -> 'role' ->> 'new', 'owner', 'audit event keeps the diff');

  perform tests.throws(format($q$select public.record_audit_event(%L, 'u', 'bogus', 'team_member', 'x')$q$, b),
    '23514', '%', 'unknown audit action rejected');

  insert into public.users (id, business_id, role) values ('user_link_a', b, 'staff');
  update public.staff set user_id = 'user_link_a' where id = v_staff;
  perform tests.throws(format($q$insert into public.staff (business_id, user_id, name) values (%L, 'user_link_a', 'Dup')$q$, b),
    '23505', '%', 'a login links to one staff row per business');
end
$$;

rollback;
