-- =============================================================================
-- Billing usage cron job: /cron/billing-usage every 30 minutes through the existing pg_cron -> pg_net path
-- (sweeps unreported bookings to the Stripe meter, see docs/BUILD_PLAN.md billing).
--   * private.invoke_cron_job() is re-created (same body as 20261027000003) with 'billing-usage' added
--     to its whitelist. Nothing else changes.
--   * The schedule is guarded like the other jobs and upserted by name.
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
  if p_job not in ('reminders', 'conversation-expiry', 'waba-health', 'token-refresh', 'cleanup', 'warm', 'attendance', 'client-notifications', 'stories', 'billing-usage') then
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
    raise notice 'pg_cron and/or pg_net not available; skipping billing-usage schedule';
    return;
  end if;

  begin
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
  exception when others then
    raise warning 'could not create pg_cron / pg_net (%); skipping billing-usage schedule', sqlerrm;
    return;
  end;

  -- cron.schedule(name, …) upserts by job name, so re-running is safe.
  perform cron.schedule('api-billing-usage', '*/30 * * * *', $job$select private.invoke_cron_job('billing-usage')$job$);
end
$$;
