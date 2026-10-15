-- Plan flags: enum, defaults, seeded catalogue, business_features(), RLS and write protection.
begin;

create temporary table f on commit drop as select tests.fixture('org_plan_a') as v;
create temporary table g on commit drop as select tests.fixture('org_plan_b') as v;
grant select on f, g to authenticated, anon;

do $$
declare
  a uuid := ((select v from f)->>'business')::uuid;
  b uuid := ((select v from g)->>'business')::uuid;
begin
  perform tests.eq((select array_agg(e.enumlabel::text order by e.enumsortorder) from pg_enum e
                      join pg_type t on t.oid = e.enumtypid where t.typname = 'plan_key'),
                   array['free','starter','growth','pro'], 'plan_key lists the four plans');
  perform tests.eq((select plan::text from public.businesses where id = a), 'free', 'new businesses default to free');

  perform tests.eq((select array_agg(feature order by feature) from public.plan_features where plan = 'free'),
                   array['extensions','inbox','whatsapp_menu'], 'free = whatsapp_menu + inbox + extensions');
  perform tests.ok(not exists (select 1 from public.plan_features where plan <> 'free' and feature in ('whatsapp_menu','inbox')),
                   'paid plans never carry whatsapp_menu or inbox');
  perform tests.ok(not exists (select 1 from public.plan_features where plan = 'free' and feature in ('companion','desktop_app','assistant_bookings')),
                   'free carries no AI / desktop / assistant bookings');
  perform tests.ok((select bool_and(exists (select 1 from public.plan_features p where p.plan = e.plan and p.feature = 'extensions'))
                      from (select unnest(enum_range(null::public.plan_key)) as plan) e),
                   'every plan includes extensions');
  perform tests.ok((select bool_and(exists (select 1 from public.plan_features p where p.plan = e.plan and p.feature = 'companion'))
                      from (select unnest(enum_range(null::public.plan_key)) as plan) e where e.plan <> 'free'),
                   'every paid plan includes the companion');
  perform tests.eq((select count(*) from public.plan_features where feature = 'assistant_bookings' and monthly_limit is not null)::int, 0,
                   'assistant booking caps are not invented (null)');

  perform tests.throws('insert into public.plan_features values (''free'', ''Bad Key'', null)', '23514', null, 'feature keys are snake_case');
  perform tests.throws('insert into public.plan_features values (''free'', ''x'', -1)', '23514', null, 'monthly_limit cannot be negative');
  perform tests.throws(format('update public.businesses set plan = ''gold'' where id = %L', a), '22P02', null, 'unknown plan rejected');

  perform tests.eq((select count(*) from public.business_features(a))::int, 3, 'business_features(free business) = 3 rows');
  perform tests.eq((select min(plan::text) from public.business_features(a)), 'free', 'business_features reports the plan');
  update public.businesses set plan = 'growth' where id = b;
  perform tests.eq((select array_agg(feature order by feature) from public.business_features(b)),
                   array['assistant_bookings','companion','desktop_app','extensions','reports'], 'growth business gets the companion set, no inbox');
  perform tests.eq((select count(*) from public.business_features(gen_random_uuid()))::int, 0, 'unknown business has no features');
end
$$;

-- ---------------------------------------------------------------- as a member of A
select tests.as_member('{"sub": "user_plan_a", "org_id": "org_plan_a", "role": "authenticated"}');
do $$
declare
  a uuid := ((select v from f)->>'business')::uuid;
  b uuid := ((select v from g)->>'business')::uuid;
begin
  perform tests.eq((select count(*) from public.business_features())::int, 3, 'member: business_features() = own business');
  perform tests.eq((select count(*) from public.business_features(a))::int, 3, 'member: own id works');
  perform tests.eq((select count(*) from public.business_features(b))::int, 0, 'member: another business returns nothing (RLS)');
  perform tests.ok((select count(*) from public.plan_features) > 0, 'member can read the plan catalogue');
  perform tests.throws('update public.businesses set plan = ''pro''', '42501', null, 'member cannot change plan');
  perform tests.throws('insert into public.plan_features values (''free'', ''companion'', null)', '42501', null, 'member cannot edit the catalogue');
  perform tests.throws('delete from public.plan_features', '42501', null, 'member cannot delete catalogue rows');
end
$$;

select tests.as_anon();
do $$
begin
  perform tests.throws('select * from public.plan_features', '42501', null, 'anon cannot read plan_features');
  perform tests.throws('select * from public.business_features()', '42501', null, 'anon cannot call business_features');
end
$$;

select tests.as_admin();
rollback;
