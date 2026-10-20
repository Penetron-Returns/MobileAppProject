-- =============================================================================
-- 0007 · Scheduled jobs (pg_cron → pg_net → API /cron/<job>)
-- BUILD_PLAN §3 "pg_cron". Fully guarded:
--   * private.invoke_cron_job() is always created; at run time it reads
--     `api_base_url` and `cron_secret` from vault.decrypted_secrets and is a
--     no-op (returns null) when Vault, pg_net or either secret is missing.
--   * Extensions are created and jobs scheduled only when pg_cron and pg_net
--     are available. Locally (plain Postgres) this whole migration is a no-op.
-- Schedules are UTC (pg_cron default): 03:00 UTC = 05:00 Africa/Johannesburg.
-- =============================================================================

create or replace function private.invoke_cron_job(p_job text)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_url        text;
  v_secret     text;
  v_request_id bigint;
begin
  if p_job not in ('reminders', 'conversation-expiry', 'waba-health', 'token-refresh', 'cleanup') then
    raise exception 'unknown cron job %', p_job;
  end if;

  if to_regclass('vault.decrypted_secrets') is null then
    raise notice 'invoke_cron_job(%): vault not available; skipping', p_job;
    return null;
  end if;
  if to_regnamespace('net') is null then
    raise notice 'invoke_cron_job(%): pg_net not available; skipping', p_job;
    return null;
  end if;

  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
     into v_url using 'api_base_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
     into v_secret using 'cron_secret';

  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    raise warning 'invoke_cron_job(%): vault secrets api_base_url / cron_secret not set; skipping', p_job;
    return null;
  end if;

  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 30000)'
     into v_request_id
    using rtrim(v_url, '/') || '/cron/' || p_job,
          jsonb_build_object('job', p_job),
          jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret);

  return v_request_id;
end;
$$;

revoke all on function private.invoke_cron_job(text) from public, anon, authenticated;
grant execute on function private.invoke_cron_job(text) to service_role;

do $$
declare
  v_job record;
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_cron and/or pg_net not available; skipping cron schedule';
    return;
  end if;

  begin
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
  exception when others then
    raise warning 'could not create pg_cron / pg_net (%); skipping cron schedule', sqlerrm;
    return;
  end;

  for v_job in
    select * from (values
      ('reminders',           '*/5 * * * *'),
      ('conversation-expiry', '*/15 * * * *'),
      ('waba-health',         '0 * * * *'),
      ('token-refresh',       '0 3 * * *'),
      ('cleanup',             '30 3 * * *')
    ) as j(name, schedule)
  loop
    -- cron.schedule(name, …) upserts by job name, so re-running is safe.
    execute 'select cron.schedule($1, $2, $3)'
      using 'api-' || v_job.name,
            v_job.schedule,
            format('select private.invoke_cron_job(%L)', v_job.name);
  end loop;
end
$$;
