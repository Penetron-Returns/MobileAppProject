-- upsert_client_by_phone
begin;

create temporary table f on commit drop as select tests.fixture('org_clients') as v;

do $$
declare
  f jsonb := (select v from f);
  c1 public.clients;
  c2 public.clients;
  c3 public.clients;
begin
  c1 := public.upsert_client_by_phone((f->>'business')::uuid, '+27831234567');
  perform tests.ok(c1.id is not null, 'upsert inserts a new client');
  perform tests.ok(c1.name is null, 'name stays null when not given');
  perform tests.ok(c1.last_seen_at = now(), 'new client gets last_seen_at');
  perform tests.eq(c1.tags, '{}'::text[], 'defaults applied (tags)');
  perform tests.ok(c1.whatsapp_opt_in, 'defaults applied (whatsapp_opt_in)');

  update public.clients set last_seen_at = '2020-01-01' where id = c1.id;
  c2 := public.upsert_client_by_phone((f->>'business')::uuid, '+27831234567', '  Naledi  ');
  perform tests.eq(c2.id, c1.id, 'same phone returns the same client');
  perform tests.ok(c2.last_seen_at = now(), 'existing client gets last_seen_at bumped');
  perform tests.eq(c2.name, 'Naledi', 'name filled (trimmed) when previously null');

  c3 := public.upsert_client_by_phone((f->>'business')::uuid, '+27831234567', 'Someone Else');
  perform tests.eq(c3.name, 'Naledi', 'existing name is never overwritten');
  c3 := public.upsert_client_by_phone((f->>'business')::uuid, '+27831234567', '   ');
  perform tests.eq(c3.name, 'Naledi', 'blank name ignored');

  c3 := public.upsert_client_by_phone((f->>'business')::uuid, '+27820000001', 'Other');
  perform tests.eq(c3.id, (f->>'client_1')::uuid, 'matches a client created elsewhere');
  perform tests.eq(c3.name, 'Client One', 'fixture name kept');

  perform tests.eq((select count(*) from public.clients where business_id = (f->>'business')::uuid and phone_e164 = '+27831234567')::int,
                   1, 'no duplicate rows');

  perform tests.throws(format($q$select public.upsert_client_by_phone(%L, '083 123 4567')$q$, f->>'business'),
    '23514', null, 'non-E.164 phone rejected (23514)');
  perform tests.throws(format($q$select public.upsert_client_by_phone(%L, '+27831234567')$q$, gen_random_uuid()),
    'P0002', 'business not found', 'unknown business → P0002');
end
$$;

rollback;
