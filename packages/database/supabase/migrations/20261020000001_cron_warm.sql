-- =============================================================================
-- Keep the api Edge Function warm
-- Nerova measures the MCP connector at 0.5-1.4 s per call while server-side work
-- is 150-260 ms; the rest is cold isolates. A `warm` cron job (GET/POST /cron/warm
-- answers 200 without touching the database) is fired every minute through the
-- existing pg_cron -> pg_net path, so an isolate is always loaded.
--   * private.invoke_cron_job() is re-created (same body as 20260924000007) with
--     'warm' added to its whitelist. Nothing else changes.
--   * The schedule is guarded exactly like the other jobs: skipped when pg_cron /
--     pg_net are not available (plain local Postgres), upserted by name otherwise.
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
  if p_job not in ('reminders', 'conversation-expiry', 'waba-health', 'token-refresh', 'cleanup', 'warm') then
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
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_cron and/or pg_net not available; skipping warm schedule';
    return;
  end if;

  begin
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
  exception when others then
    raise warning 'could not create pg_cron / pg_net (%); skipping warm schedule', sqlerrm;
    return;
  end;

  -- cron.schedule(name, …) upserts by job name, so re-running is safe.
  perform cron.schedule('api-warm', '* * * * *', $job$select private.invoke_cron_job('warm')$job$);
end
$$;
