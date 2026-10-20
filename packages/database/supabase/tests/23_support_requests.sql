-- Support requests: service role writes, owners read their own business only, staff and anon read nothing.
begin;

create temporary table fx (label text primary key, v jsonb) on commit drop;
grant select on fx to authenticated;

do $$
declare
  fa jsonb := tests.fixture('org_sr_a');
  fb jsonb := tests.fixture('org_sr_b');
  ba uuid := (fa->>'business')::uuid;
  bb uuid := (fb->>'business')::uuid;
begin
  insert into fx values ('a', fa), ('b', fb);
  insert into public.users (id, business_id, role) values ('sr_owner_a', ba, 'owner'), ('sr_staff_a', ba, 'staff'), ('sr_owner_b', bb, 'owner');
  insert into public.support_requests (business_id, nerova_account_id, summary) values (ba, 'acct_a', 'help a'), (bb, 'acct_b', 'help b');
  perform tests.eq((select status from public.support_requests where business_id = ba), 'open', 'a request starts open');
  perform tests.throws(format($q$update public.support_requests set status = 'resolved' where business_id = %L$q$, ba), '23514', null, 'resolved needs resolved_at');
  update public.support_requests set status = 'resolved', resolved_at = now() where business_id = ba;
  perform tests.eq((select status from public.support_requests where business_id = ba), 'resolved', 'a request can be resolved');
  perform tests.throws(format($q$insert into public.support_requests (business_id, nerova_account_id, summary, status) values (%L, 'x', 's', 'bogus')$q$, ba), '23514', null, 'status is constrained');
end
$$;

select tests.as_member('{"sub": "sr_owner_a", "org_id": "org_sr_a", "org_role": "org:admin", "role": "authenticated"}');
do $$
begin
  perform tests.eq((select count(*) from public.support_requests)::int, 1, 'an owner sees only their own business requests');
  perform tests.throws($q$insert into public.support_requests (business_id, nerova_account_id, summary) values ((select id from public.businesses limit 1), 'x', 's')$q$, '42501', null, 'authenticated cannot INSERT');
  perform tests.throws($q$update public.support_requests set summary = 'x'$q$, '42501', null, 'authenticated cannot UPDATE');
  perform tests.throws($q$delete from public.support_requests$q$, '42501', null, 'authenticated cannot DELETE');
end
$$;

select tests.as_member('{"sub": "sr_staff_a", "org_id": "org_sr_a", "org_role": "org:member", "role": "authenticated"}');
do $$
begin
  perform tests.eq((select count(*) from public.support_requests)::int, 0, 'staff cannot read support requests');
end
$$;

select tests.as_anon();
do $$
begin
  perform tests.throws($q$select count(*) from public.support_requests$q$, '42501', null, 'anon cannot read support requests');
end
$$;

rollback;
