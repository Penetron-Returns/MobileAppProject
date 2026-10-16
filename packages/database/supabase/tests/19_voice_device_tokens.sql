-- Device voice tokens: service-role only (RLS on, no policies, no grants), unique hash, cascade with the user.
begin;

create temporary table fx (label text primary key, v jsonb) on commit drop;
grant select on fx to authenticated;

do $$
declare
  fa jsonb := tests.fixture('org_vdt_a');
  ba uuid := (fa->>'business')::uuid;
begin
  insert into fx values ('a', fa);
  insert into public.users (id, business_id, role) values ('vdt_owner_a', ba, 'owner');
  insert into public.voice_device_tokens (business_id, user_id, token_hash, device_label)
    values (ba, 'vdt_owner_a', repeat('a', 64), 'pixel');
  perform tests.eq((select count(*) from public.voice_device_tokens)::int, 1, 'service role writes and reads tokens');
  perform tests.throws(format($q$insert into public.voice_device_tokens (business_id, user_id, token_hash) values (%L, 'vdt_owner_a', %L)$q$, ba, repeat('a', 64)),
    '23505', null, 'token_hash is unique');
  perform tests.eq((select device_label from public.voice_device_tokens where user_id = 'vdt_owner_a'), 'pixel', 'device_label is stored');
end
$$;

select tests.as_member('{"sub": "vdt_owner_a", "org_id": "org_vdt_a", "org_role": "org:admin", "role": "authenticated"}');
do $$
declare
  fa jsonb := (select v from fx where label = 'a');
begin
  perform tests.throws($q$select count(*) from public.voice_device_tokens$q$, '42501', null, 'authenticated cannot read device tokens');
  perform tests.throws(format($q$insert into public.voice_device_tokens (business_id, user_id, token_hash) values (%L, 'vdt_owner_a', 'x')$q$, fa->>'business'),
    '42501', null, 'authenticated cannot INSERT device tokens');
  perform tests.throws($q$update public.voice_device_tokens set revoked_at = null$q$, '42501', null, 'authenticated cannot UPDATE device tokens');
  perform tests.throws($q$delete from public.voice_device_tokens$q$, '42501', null, 'authenticated cannot DELETE device tokens');
end
$$;

select tests.as_anon();
do $$
begin
  perform tests.throws($q$select count(*) from public.voice_device_tokens$q$, '42501', null, 'anon cannot read device tokens');
end
$$;

select tests.as_admin();
do $$
begin
  delete from public.users where id = 'vdt_owner_a';
  perform tests.eq((select count(*) from public.voice_device_tokens)::int, 0, 'tokens go with the user (member removed)');
end
$$;

rollback;
