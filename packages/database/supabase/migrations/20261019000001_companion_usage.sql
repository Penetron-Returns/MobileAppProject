-- =============================================================================
-- Companion plans: usage counting, reports and the Nerova account mapping.
--
--   * plan_features: paid plans gain `reports` (the Reports tab replaces the Inbox)
--   * businesses.nerova_account_id: cached Nerova `acct_` id (null = not resolved yet)
--   * completed_jobs_in_month(): the billable unit. A completed job is an appointment
--     whose END has passed (in the month of the business timezone) and whose status is
--     neither 'cancelled' nor 'no_show'. Owners never have to tap "completed".
--   * month_report(): everything the Reports screen shows from our own data
--
-- Both functions are SECURITY INVOKER and service_role only: the API passes the business
-- explicitly (every query is business-scoped) and an injected `p_now` keeps them
-- deterministic and testable.
-- =============================================================================

insert into public.plan_features (plan, feature, monthly_limit) values
  ('starter', 'reports', null),
  ('growth',  'reports', null),
  ('pro',     'reports', null)
on conflict (plan, feature) do nothing;

alter table public.businesses add column if not exists nerova_account_id text;
alter table public.businesses drop constraint if exists businesses_nerova_account_id_check;
alter table public.businesses add constraint businesses_nerova_account_id_check
  check (nerova_account_id is null or length(nerova_account_id) between 1 and 200);

-- Month scans per business ("ends in this month").
create index if not exists appointments_business_ends_at_idx on public.appointments (business_id, ends_at);

-- -----------------------------------------------------------------------------
-- completed_jobs_in_month
-- p_month: any date in the month (normalised to its first day), read in the business timezone.
-- -----------------------------------------------------------------------------
create or replace function public.completed_jobs_in_month(
  p_business_id uuid,
  p_month       date,
  p_now         timestamptz default now()
)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz   text;
  v_from timestamptz;
  v_to   timestamptz;
begin
  select b.timezone into v_tz from public.businesses b where b.id = p_business_id;
  if v_tz is null then
    raise exception using errcode = 'P0002', message = 'business not found';
  end if;
  v_from := date_trunc('month', p_month::timestamp) at time zone v_tz;
  v_to   := (date_trunc('month', p_month::timestamp) + interval '1 month') at time zone v_tz;
  return (
    select count(*)::integer
      from public.appointments a
     where a.business_id = p_business_id
       and a.status not in ('cancelled', 'no_show')
       and a.ends_at <= p_now
       and a.ends_at >= v_from and a.ends_at < v_to
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- month_report
-- Returns {
--   completed_jobs, revenue_cents,
--   bookings_created: { whatsapp, nerova, app, web },   (created_at in the month, any status)
--   no_shows, cancellations,                            (appointments STARTING in the month)
--   busiest: { weekday (0 = Sunday), hour (0-23) } | null, (over the completed jobs, by local start)
--   weekly: [{ week_start (Monday), completed_jobs }]   (every week touching the month, zeros included)
-- }
-- -----------------------------------------------------------------------------
create or replace function public.month_report(
  p_business_id uuid,
  p_month       date,
  p_now         timestamptz default now()
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz          text;
  v_month_start date := date_trunc('month', p_month::timestamp)::date;
  v_from        timestamptz;
  v_to          timestamptz;
  v_month_end   date := (date_trunc('month', p_month::timestamp) + interval '1 month')::date - 1;
  v_sources     jsonb;
  v_no_shows    integer;
  v_cancelled   integer;
  v_result      jsonb;
begin
  select b.timezone into v_tz from public.businesses b where b.id = p_business_id;
  if v_tz is null then
    raise exception using errcode = 'P0002', message = 'business not found';
  end if;
  v_from := v_month_start::timestamp at time zone v_tz;
  v_to   := (v_month_end + 1)::timestamp at time zone v_tz;

  select jsonb_build_object(
           'whatsapp', count(*) filter (where a.source = 'whatsapp'),
           'nerova',   count(*) filter (where a.source = 'nerova'),
           'app',      count(*) filter (where a.source = 'app'),
           'web',      count(*) filter (where a.source = 'web'))
    into v_sources
    from public.appointments a
   where a.business_id = p_business_id and a.created_at >= v_from and a.created_at < v_to;

  select count(*) filter (where a.status = 'no_show')::integer,
         count(*) filter (where a.status = 'cancelled')::integer
    into v_no_shows, v_cancelled
    from public.appointments a
   where a.business_id = p_business_id and a.starts_at >= v_from and a.starts_at < v_to;

  with jobs as (
    select (a.starts_at at time zone v_tz) as local_start,
           (a.ends_at at time zone v_tz)::date as end_day,
           a.price_cents
      from public.appointments a
     where a.business_id = p_business_id
       and a.status not in ('cancelled', 'no_show')
       and a.ends_at <= p_now
       and a.ends_at >= v_from and a.ends_at < v_to
  ),
  weekday_pick as (
    select extract(dow from local_start)::integer as weekday from jobs group by 1 order by count(*) desc, 1 limit 1
  ),
  hour_pick as (
    select extract(hour from local_start)::integer as hour from jobs group by 1 order by count(*) desc, 1 limit 1
  ),
  weeks as (
    select g.d::date as week_start
      from generate_series(date_trunc('week', v_month_start::timestamp), v_month_end::timestamp, interval '7 days') as g(d)
  )
  select jsonb_build_object(
           'completed_jobs', (select count(*) from jobs),
           'revenue_cents',  (select coalesce(sum(price_cents), 0) from jobs),
           'busiest',        (select jsonb_build_object('weekday', w.weekday, 'hour', h.hour)
                                from weekday_pick w, hour_pick h),
           'weekly',         (select coalesce(jsonb_agg(jsonb_build_object(
                                       'week_start', to_char(wk.week_start, 'YYYY-MM-DD'),
                                       'completed_jobs', (select count(*) from jobs j
                                                           where j.end_day >= wk.week_start and j.end_day < wk.week_start + 7))
                                     order by wk.week_start), '[]'::jsonb)
                                from weeks wk))
    into v_result;

  return v_result || jsonb_build_object(
    'bookings_created', v_sources,
    'no_shows',         v_no_shows,
    'cancellations',    v_cancelled);
end;
$$;

revoke all on function public.completed_jobs_in_month(uuid, date, timestamptz) from public, anon, authenticated;
grant execute on function public.completed_jobs_in_month(uuid, date, timestamptz) to service_role;
revoke all on function public.month_report(uuid, date, timestamptz) from public, anon, authenticated;
grant execute on function public.month_report(uuid, date, timestamptz) to service_role;
