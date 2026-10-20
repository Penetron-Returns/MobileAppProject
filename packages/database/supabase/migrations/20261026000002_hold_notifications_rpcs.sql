-- =============================================================================
-- Act-then-undo RPCs (enum value 'voided' is added in 20261026000001).
--   * void_appointment: cancel + voided_at + a 'voided' event (instead of 'cancelled'):
--     no fee, no late-cancel penalty, not in client-visible cancellation history.
--   * claim_due_client_notifications: atomic claim (UPDATE ... RETURNING, SKIP LOCKED)
--     of held appointments whose hold has passed; the caller sends the 'created'
--     message only when the row is still confirmed and not voided.
--   * claim_due_reminders: skips held appointments.
--   * dashboard_summary / month_report: voided bookings are excluded.
-- =============================================================================

create or replace function public.void_appointment(
  p_appointment_id uuid,
  p_actor          public.actor_type,
  p_actor_id       text
)
returns public.appointments
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_appt public.appointments;
  v_row  public.appointments;
begin
  p_actor_id := nullif(btrim(p_actor_id), '');
  if p_actor is null then
    perform private.raise_rule('INVALID_INPUT', 'actor is required');
  end if;

  select * into v_appt from public.appointments a where a.id = p_appointment_id for update;
  if not found then
    perform private.raise_not_found('appointment');
  end if;
  if v_appt.status <> 'confirmed' then
    perform private.raise_rule('INVALID_STATUS', 'Only confirmed appointments can be voided');
  end if;

  update public.appointments a
     set status              = 'cancelled',
         cancelled_at        = now(),
         cancel_reason       = 'voided',
         voided_at           = now(),
         client_notify_after = null
   where a.id = v_appt.id
  returning * into v_row;

  insert into public.appointment_events (business_id, appointment_id, type, actor, actor_id, payload)
  values (
    v_row.business_id, v_row.id, 'voided', p_actor, p_actor_id,
    jsonb_build_object('starts_at', private.iso_utc(lower(v_row.slot)))
  );

  return v_row;
end;
$$;

create or replace function public.claim_due_client_notifications(
  p_now   timestamptz,
  p_limit integer default 100
)
returns table (
  appointment_id uuid,
  business_id    uuid,
  client_id      uuid,
  status         public.appointment_status,
  voided         boolean
)
language sql
volatile
set search_path = ''
as $$
  with due as (
    select a.id
      from public.appointments a
     where a.client_notify_after is not null
       and a.client_notify_after <= p_now
     order by a.client_notify_after, a.id
     limit greatest(coalesce(p_limit, 100), 0)
       for update skip locked
  )
  update public.appointments a
     set client_notify_after = null
    from due
   where a.id = due.id
  returning a.id, a.business_id, a.client_id, a.status, (a.voided_at is not null);
$$;

create or replace function public.claim_due_reminders(
  p_now   timestamptz,
  p_limit integer default 100
)
returns table (
  appointment_id uuid,
  business_id    uuid,
  client_id      uuid,
  offset_minutes integer,
  starts_at      timestamptz
)
language sql
volatile
set search_path = ''
as $$
  with due as (
    select a.id               as appointment_id,
           a.business_id,
           a.client_id,
           o.offset_minutes,
           lower(a.slot)      as starts_at,
           lower(a.slot) - make_interval(mins => o.offset_minutes) as send_at
      from public.appointments a
      join public.businesses b on b.id = a.business_id
     cross join lateral (
            -- CASE guards the cast: non-numeric entries are ignored, never cast
            select distinct x.minutes::integer as offset_minutes
              from jsonb_array_elements(
                     case when jsonb_typeof(b.booking_rules -> 'reminder_offsets_minutes') = 'array'
                          then b.booking_rules -> 'reminder_offsets_minutes'
                          else '[]'::jsonb end) as e
             cross join lateral (
                    select case when jsonb_typeof(e.value) = 'number' then (e.value)::numeric end as minutes
                  ) x
             where x.minutes > 0
          ) o
     where a.status = 'confirmed'
       -- held bookings (act-then-undo) stay silent until the hold cron clears the field
       and a.client_notify_after is null
       and a.starts_at > p_now
       and a.starts_at - make_interval(mins => o.offset_minutes) <= p_now
       and a.starts_at - make_interval(mins => o.offset_minutes) >= p_now - interval '30 minutes'
       and not exists (
             select 1 from public.appointment_events ev
              where ev.appointment_id = a.id
                and ev.type = 'reminder_sent'
                and ev.payload ->> 'offset_minutes' = o.offset_minutes::text
                and ev.payload ->> 'starts_at' = private.iso_utc(lower(a.slot))
           )
     order by send_at, a.id, o.offset_minutes
     limit greatest(coalesce(p_limit, 100), 0)
  ),
  claimed as (
    insert into public.appointment_events (business_id, appointment_id, type, actor, actor_id, payload)
    select d.business_id, d.appointment_id, 'reminder_sent', 'system', null,
           jsonb_build_object('offset_minutes', d.offset_minutes,
                              'starts_at', private.iso_utc(d.starts_at),
                              'state', 'claimed')
      from due d
    on conflict (appointment_id, (payload ->> 'offset_minutes'), (payload ->> 'starts_at'))
       where type = 'reminder_sent'
       do nothing
    returning appointment_events.appointment_id,
              (appointment_events.payload ->> 'offset_minutes')::integer as offset_minutes
  )
  select d.appointment_id, d.business_id, d.client_id, d.offset_minutes, d.starts_at
    from due d
    join claimed c on c.appointment_id = d.appointment_id and c.offset_minutes = d.offset_minutes
   order by d.send_at, d.appointment_id, d.offset_minutes;
$$;

create or replace function public.dashboard_summary(p_date date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_business    uuid := private.current_business_id();
  v_tz          text;
  v_date        date;
  v_month_start date;
  v_month_end   date;
  v_from        timestamptz;
  v_to          timestamptz;
  v_day_from    timestamptz;
  v_day_to      timestamptz;
  v_by_day      jsonb;
  v_month_total bigint;
  v_today       jsonb;
  v_next        uuid;
begin
  if v_business is not null then
    select b.timezone into v_tz from public.businesses b where b.id = v_business;
  end if;
  if v_tz is null then
    raise exception using errcode = 'P0002', message = 'business not found for the current organisation';
  end if;

  v_date        := coalesce(p_date, (now() at time zone v_tz)::date);
  v_month_start := date_trunc('month', v_date)::date;
  v_month_end   := (v_month_start + interval '1 month')::date - 1;
  v_from        := v_month_start::timestamp at time zone v_tz;
  v_to          := (v_month_end + 1)::timestamp at time zone v_tz;
  v_day_from    := v_date::timestamp at time zone v_tz;
  v_day_to      := (v_date + 1)::timestamp at time zone v_tz;

  with rev as (
    select (a.starts_at at time zone v_tz)::date as d, sum(a.price_cents)::bigint as cents
      from public.appointments a
     where a.business_id = v_business
       and a.starts_at >= v_from and a.starts_at < v_to
       and a.status in ('confirmed', 'completed')
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('date', to_char(g.d, 'YYYY-MM-DD'),
                                               'cents', coalesce(r.cents, 0))
                            order by g.d), '[]'::jsonb),
         coalesce(sum(r.cents), 0)
    into v_by_day, v_month_total
    from generate_series(v_month_start, v_month_end, interval '1 day') as gs(ts)
    cross join lateral (select gs.ts::date as d) g
    left join rev r on r.d = g.d;

  select jsonb_build_object(
           'total',      count(*),
           'confirmed',  count(*) filter (where a.status = 'confirmed'),
           'completed',  count(*) filter (where a.status = 'completed'),
           'cancelled',  count(*) filter (where a.status = 'cancelled'),
           'no_show',    count(*) filter (where a.status = 'no_show'),
           'checked_in', count(*) filter (where a.checked_in_at is not null and a.status <> 'cancelled'))
    into v_today
    from public.appointments a
   where a.business_id = v_business
     and a.voided_at is null
     and a.starts_at >= v_day_from and a.starts_at < v_day_to;

  select a.id into v_next
    from public.appointments a
   where a.business_id = v_business
     and a.status = 'confirmed'
     and a.checked_in_at is null
     and a.starts_at >= v_day_from and a.starts_at < v_day_to
     and a.ends_at > now()
   order by a.starts_at, a.id
   limit 1;

  return jsonb_build_object(
    'month_revenue_cents', v_month_total,
    'revenue_by_day',      v_by_day,
    'today',               v_today,
    'next_appointment_id', v_next
  );
end;
$$;

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
   where a.business_id = p_business_id and a.voided_at is null and a.created_at >= v_from and a.created_at < v_to;

  select count(*) filter (where a.status = 'no_show')::integer,
         count(*) filter (where a.status = 'cancelled')::integer
    into v_no_shows, v_cancelled
    from public.appointments a
   where a.business_id = p_business_id and a.voided_at is null and a.starts_at >= v_from and a.starts_at < v_to;

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

revoke all on function public.void_appointment(uuid, public.actor_type, text) from public, anon, authenticated;
revoke all on function public.claim_due_client_notifications(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.void_appointment(uuid, public.actor_type, text) to service_role;
grant execute on function public.claim_due_client_notifications(timestamptz, integer) to service_role;
