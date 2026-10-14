-- Cron invoker is a no-op locally; seed data is present and consistent.
begin;

do $$
begin
  perform tests.ok(private.invoke_cron_job('reminders') is null, 'invoke_cron_job is a no-op without vault/pg_net');
  perform tests.throws($q$select private.invoke_cron_job('rm -rf')$q$, 'P0001', 'unknown cron job%', 'invoke_cron_job rejects unknown jobs');
  perform tests.ok(not exists (select 1 from pg_extension where extname in ('pg_cron', 'pg_net')),
                   'cron migration skipped cleanly without pg_cron/pg_net');
end
$$;

do $$
declare
  b uuid := (select id from public.businesses where slug = 'ashgrove');
begin
  perform tests.ok(b = '10000000-0000-4000-8000-000000000001', 'seed: Ashgrove business with fixed id');
  perform tests.ok((select clerk_org_id = 'org_demo_ashgrove' and timezone = 'Africa/Johannesburg' and currency = 'ZAR'
                      from public.businesses where id = b), 'seed: org, timezone, currency');
  perform tests.eq((select count(*) from public.businesses where slug = 'ASHGROVE')::int, 1, 'slug is case-insensitive (citext)');
  perform tests.eq((select count(*) from public.services where business_id = b)::int, 9, 'seed: 9 services');
  perform tests.eq((select array_agg(distinct category order by category) from public.services where business_id = b),
                   array['Hair', 'Nails', 'Wellness'], 'seed: services grouped by category');
  perform tests.eq((select price_cents from public.services where business_id = b and name = 'Balayage & Toner'), 220000,
                   'seed: prices in cents');
  perform tests.eq((select count(*) from public.staff where business_id = b)::int, 4, 'seed: 4 staff');
  perform tests.ok(not (select accepts_bookings from public.staff where business_id = b and name = 'Sarah Jenkins'),
                   'seed: Sarah is on leave (accepts_bookings = false)');
  perform tests.eq((select count(*) from public.business_hours where business_id = b and weekday = 0)::int, 0, 'seed: closed on Sunday');
  perform tests.eq((select count(*) from public.business_hours where business_id = b and weekday = 3)::int, 2, 'seed: lunch gap on weekdays');
  perform tests.ok((select count(*) from public.clients where business_id = b and 'VIP' = any (tags)) >= 2, 'seed: VIP clients');
  perform tests.ok((select count(*) from public.appointments where business_id = b) >= 30, 'seed: appointments');
  perform tests.ok((select count(distinct status) from public.appointments where business_id = b) >= 3, 'seed: mixed statuses');
  perform tests.ok(exists (select 1 from public.appointments where business_id = b
                             and starts_at >= date_trunc('week', now() at time zone 'Africa/Johannesburg') at time zone 'Africa/Johannesburg'
                             and starts_at < (date_trunc('week', now() at time zone 'Africa/Johannesburg') + interval '7 days') at time zone 'Africa/Johannesburg'),
                   'seed: appointments in the current week');
  perform tests.ok((select status = 'pending' and access_token_ciphertext is null
                      from public.whatsapp_accounts where business_id = b), 'seed: WhatsApp account pending, no token');
  perform tests.eq((select count(*) from public.escalations where business_id = b and status = 'open')::int, 1, 'seed: one open escalation');
  perform tests.ok((select count(*) from public.messages where business_id = b) >= 4, 'seed: conversation messages');
end
$$;

rollback;
