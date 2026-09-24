-- =============================================================================
-- 0005 · RPCs (BUILD_PLAN §3 "RPCs")
--
-- Error conventions (mapped by backend/src/lib/errors.ts mapDbError):
--   23P01                         → SLOT_UNAVAILABLE (exclusion constraint)
--   P0002                         → NOT_FOUND
--   P0001 'RULE:<CODE>:<message>' → RULE_VIOLATION (details.rule = <CODE>)
--
-- All write RPCs are EXECUTE-able by service_role only. They are SECURITY
-- INVOKER (service_role already has full table access and bypasses RLS);
-- dashboard_summary is invoker too so RLS applies to authenticated callers.
-- Every function pins search_path = '' and uses fully-qualified names.
--
-- Appointment RPCs that take only an appointment id do not know the caller's
-- business: the API must verify ownership (select … where business_id = $1)
-- before calling them.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- internal: raise a RULE violation
-- -----------------------------------------------------------------------------
create or replace function private.raise_rule(p_code text, p_message text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'RULE:' || p_code || ':' || p_message;
end;
$$;

create or replace function private.raise_not_found(p_entity text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0002', message = p_entity || ' not found';
end;
$$;

-- internal: business buffer (minutes, >= 0) from booking_rules
create or replace function private.business_buffer_minutes(p_business_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(0, coalesce(
    case when jsonb_typeof(b.booking_rules -> 'buffer_minutes') = 'number'
         then (b.booking_rules ->> 'buffer_minutes')::numeric::integer end,
    0))
  from public.businesses b
  where b.id = p_business_id;
$$;

-- internal: validate that a staff member can take a booking for a service
create or replace function private.assert_staff_bookable(
  p_business_id uuid, p_staff_id uuid, p_service_id uuid
)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_staff public.staff;
begin
  select * into v_staff
  from public.staff s
  where s.id = p_staff_id and s.business_id = p_business_id;
  if not found then
    perform private.raise_not_found('staff');
  end if;
  if not v_staff.is_active then
    perform private.raise_rule('STAFF_INACTIVE', 'Staff member is not active');
  end if;
  if not v_staff.accepts_bookings then
    perform private.raise_rule('STAFF_INACTIVE', 'Staff member is not accepting bookings');
  end if;
  if not exists (
    select 1 from public.staff_services ss
    where ss.business_id = p_business_id and ss.staff_id = p_staff_id and ss.service_id = p_service_id
  ) then
    perform private.raise_rule('STAFF_NOT_QUALIFIED', 'Staff member does not perform this service');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. set_request_context
-- Transaction-local: only affects statements in the same transaction. Through
-- PostgREST every call is its own transaction, so plain table writes should
-- carry x-actor-id / x-request-id headers instead (see private.request_context).
-- -----------------------------------------------------------------------------
create or replace function public.set_request_context(p_actor_id text, p_request_id text)
returns void
language sql
volatile
set search_path = ''
as $$
  select set_config('app.actor_id', coalesce(p_actor_id, ''), true),
         set_config('app.request_id', coalesce(p_request_id, ''), true);
$$;

-- -----------------------------------------------------------------------------
-- 1. create_appointment
-- -----------------------------------------------------------------------------
create or replace function public.create_appointment(
  p_business_id     uuid,
  p_client_id       uuid,
  p_staff_id        uuid,
  p_service_id      uuid,
  p_starts_at       timestamptz,
  p_source          public.appointment_source,
  p_idempotency_key text,
  p_actor           public.actor_type,
  p_actor_id        text,
  p_notes           text default null
)
returns public.appointments
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_existing public.appointments;
  v_service  public.services;
  v_client   public.clients;
  v_buffer   integer;
  v_slot     tstzrange;
  v_blocked  tstzrange;
  v_row      public.appointments;
begin
  p_actor_id := nullif(btrim(p_actor_id), '');  -- '' = no actor id (system)
  if p_starts_at is null then
    perform private.raise_rule('INVALID_INPUT', 'starts_at is required');
  end if;
  if p_source is null or p_actor is null then
    perform private.raise_rule('INVALID_INPUT', 'source and actor are required');
  end if;

  -- Idempotent replay
  if p_idempotency_key is not null then
    select * into v_existing from public.appointments a where a.idempotency_key = p_idempotency_key;
    if found then
      if v_existing.business_id <> p_business_id then
        perform private.raise_rule('IDEMPOTENCY_KEY_REUSED',
          'Idempotency key was already used by another business');
      end if;
      return v_existing;
    end if;
  end if;

  v_buffer := private.business_buffer_minutes(p_business_id);
  if v_buffer is null then
    perform private.raise_not_found('business');
  end if;

  select * into v_service from public.services s
  where s.id = p_service_id and s.business_id = p_business_id;
  if not found then
    perform private.raise_not_found('service');
  end if;
  if not v_service.is_active then
    perform private.raise_rule('SERVICE_INACTIVE', 'Service is not active');
  end if;

  perform private.assert_staff_bookable(p_business_id, p_staff_id, p_service_id);

  select * into v_client from public.clients c
  where c.id = p_client_id and c.business_id = p_business_id;
  if not found then
    perform private.raise_not_found('client');
  end if;
  if v_client.is_blocked then
    perform private.raise_rule('CLIENT_BLOCKED', 'Client is blocked from booking');
  end if;

  v_slot    := tstzrange(p_starts_at, p_starts_at + make_interval(mins => v_service.duration_minutes), '[)');
  v_blocked := tstzrange(p_starts_at,
                         p_starts_at + make_interval(mins => v_service.duration_minutes + v_buffer), '[)');

  begin
    insert into public.appointments (
      business_id, client_id, staff_id, service_id, slot, blocked, status, source,
      price_cents, duration_minutes, notes, idempotency_key, created_by
    ) values (
      p_business_id, p_client_id, p_staff_id, p_service_id, v_slot, v_blocked, 'confirmed', p_source,
      v_service.price_cents, v_service.duration_minutes, p_notes, p_idempotency_key, p_actor_id
    )
    returning * into v_row;
  exception
    when unique_violation or exclusion_violation then
      -- A concurrent request with the same idempotency key may have won the
      -- race (both unique and exclusion checks wait for it to commit).
      if p_idempotency_key is not null then
        select * into v_existing from public.appointments a where a.idempotency_key = p_idempotency_key;
        if found then
          if v_existing.business_id <> p_business_id then
            perform private.raise_rule('IDEMPOTENCY_KEY_REUSED',
              'Idempotency key was already used by another business');
          end if;
          return v_existing;
        end if;
      end if;
      raise; -- genuine overlap → 23P01 → SLOT_UNAVAILABLE
  end;

  insert into public.appointment_events (business_id, appointment_id, type, actor, actor_id, payload)
  values (
    v_row.business_id, v_row.id, 'created', p_actor, p_actor_id,
    jsonb_build_object(
      'starts_at',  private.iso_utc(lower(v_row.slot)),
      'ends_at',    private.iso_utc(upper(v_row.slot)),
      'staff_id',   v_row.staff_id,
      'service_id', v_row.service_id,
      'source',     v_row.source
    )
  );

  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. reschedule_appointment
-- (p_staff_id is last so Postgres accepts the default; call by name.)
-- -----------------------------------------------------------------------------
create or replace function public.reschedule_appointment(
  p_appointment_id uuid,
  p_starts_at      timestamptz,
  p_actor          public.actor_type,
  p_actor_id       text,
  p_staff_id       uuid default null
)
returns public.appointments
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_appt    public.appointments;
  v_staff   uuid;
  v_buffer  integer;
  v_row     public.appointments;
begin
  p_actor_id := nullif(btrim(p_actor_id), '');
  if p_starts_at is null or p_actor is null then
    perform private.raise_rule('INVALID_INPUT', 'starts_at and actor are required');
  end if;

  select * into v_appt from public.appointments a where a.id = p_appointment_id for update;
  if not found then
    perform private.raise_not_found('appointment');
  end if;
  if v_appt.status <> 'confirmed' then
    perform private.raise_rule('INVALID_STATUS', 'Only confirmed appointments can be rescheduled');
  end if;

  v_staff := coalesce(p_staff_id, v_appt.staff_id);
  if v_staff <> v_appt.staff_id then
    perform private.assert_staff_bookable(v_appt.business_id, v_staff, v_appt.service_id);
  end if;

  v_buffer := private.business_buffer_minutes(v_appt.business_id);

  update public.appointments a
     set staff_id = v_staff,
         slot     = tstzrange(p_starts_at, p_starts_at + make_interval(mins => v_appt.duration_minutes), '[)'),
         blocked  = tstzrange(p_starts_at,
                              p_starts_at + make_interval(mins => v_appt.duration_minutes + v_buffer), '[)')
   where a.id = v_appt.id
  returning * into v_row;

  insert into public.appointment_events (business_id, appointment_id, type, actor, actor_id, payload)
  values (
    v_row.business_id, v_row.id, 'rescheduled', p_actor, p_actor_id,
    jsonb_build_object(
      'from',          private.iso_utc(lower(v_appt.slot)),
      'to',            private.iso_utc(lower(v_row.slot)),
      'from_staff_id', v_appt.staff_id,
      'to_staff_id',   v_row.staff_id
    )
  );

  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. cancel_appointment
-- -----------------------------------------------------------------------------
create or replace function public.cancel_appointment(
  p_appointment_id uuid,
  p_actor          public.actor_type,
  p_actor_id       text,
  p_reason         text default null
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
    perform private.raise_rule('INVALID_STATUS', 'Only confirmed appointments can be cancelled');
  end if;

  update public.appointments a
     set status        = 'cancelled',
         cancelled_at  = now(),
         cancel_reason = p_reason
   where a.id = v_appt.id
  returning * into v_row;

  insert into public.appointment_events (business_id, appointment_id, type, actor, actor_id, payload)
  values (
    v_row.business_id, v_row.id, 'cancelled', p_actor, p_actor_id,
    jsonb_build_object('reason', p_reason, 'starts_at', private.iso_utc(lower(v_row.slot)))
  );

  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. set_appointment_status (confirmed → completed | no_show)
-- -----------------------------------------------------------------------------
create or replace function public.set_appointment_status(
  p_appointment_id uuid,
  p_status         public.appointment_status,
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
  if p_status is null or p_status not in ('completed', 'no_show') then
    perform private.raise_rule('INVALID_STATUS', 'Status can only be set to completed or no_show');
  end if;

  select * into v_appt from public.appointments a where a.id = p_appointment_id for update;
  if not found then
    perform private.raise_not_found('appointment');
  end if;
  if v_appt.status <> 'confirmed' then
    perform private.raise_rule('INVALID_STATUS',
      format('Cannot change status from %s to %s', v_appt.status, p_status));
  end if;

  update public.appointments a
     set status = p_status
   where a.id = v_appt.id
  returning * into v_row;

  insert into public.appointment_events (business_id, appointment_id, type, actor, actor_id, payload)
  values (
    v_row.business_id, v_row.id, p_status::text::public.appointment_event_type, p_actor, p_actor_id,
    jsonb_build_object('from_status', v_appt.status, 'to_status', p_status)
  );

  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. check_in_appointment (staff action; repeat check-ins are a no-op)
-- -----------------------------------------------------------------------------
create or replace function public.check_in_appointment(
  p_appointment_id uuid,
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
  select * into v_appt from public.appointments a where a.id = p_appointment_id for update;
  if not found then
    perform private.raise_not_found('appointment');
  end if;
  if v_appt.status <> 'confirmed' then
    perform private.raise_rule('INVALID_STATUS', 'Only confirmed appointments can be checked in');
  end if;
  if v_appt.checked_in_at is not null then
    return v_appt;
  end if;

  update public.appointments a
     set checked_in_at = now()
   where a.id = v_appt.id
  returning * into v_row;

  insert into public.appointment_events (business_id, appointment_id, type, actor, actor_id, payload)
  values (v_row.business_id, v_row.id, 'checked_in', 'staff', p_actor_id,
          jsonb_build_object('checked_in_at', private.iso_utc(v_row.checked_in_at)));

  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. upsert_client_by_phone
-- -----------------------------------------------------------------------------
create or replace function public.upsert_client_by_phone(
  p_business_id uuid,
  p_phone_e164  text,
  p_name        text default null
)
returns public.clients
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_row public.clients;
begin
  if not exists (select 1 from public.businesses b where b.id = p_business_id) then
    perform private.raise_not_found('business');
  end if;

  insert into public.clients as c (business_id, phone_e164, name, last_seen_at)
  values (p_business_id, p_phone_e164, nullif(btrim(p_name), ''), now())
  on conflict (business_id, phone_e164) do update
     set last_seen_at = now(),
         name         = coalesce(c.name, excluded.name)
  returning * into v_row;

  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. claim_due_reminders
-- For each confirmed future appointment and each offset in the business's
-- reminder_offsets_minutes whose send time (start − offset) is due but not
-- more than 30 min overdue, atomically inserts a reminder_sent event
-- ({offset_minutes, starts_at, state:'claimed'}) and returns it. The partial
-- unique index guarantees each (appointment, offset, start) is claimed once,
-- even under concurrent callers.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 8. dashboard_summary (callable by authenticated; scoped by the JWT's org)
-- month = calendar month containing p_date, in the business timezone.
-- revenue = confirmed + completed (cancelled / no_show excluded), bucketed by
-- the appointment's local start date; revenue_by_day covers every day of the
-- month (zeros included). today = appointments starting on p_date (local).
-- next_appointment_id = earliest confirmed, not-yet-checked-in appointment on
-- p_date that has not ended yet.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 9a. replace_business_hours(p_rows: [{weekday, opens_at, closes_at}])
-- Atomic full replace, applied as a diff so unchanged rows (and their audit
-- history) are left alone. Overlapping windows on one weekday are rejected.
-- Returns the business's hours after the replace.
-- -----------------------------------------------------------------------------
create or replace function public.replace_business_hours(
  p_business_id uuid,
  p_rows        jsonb
)
returns setof public.business_hours
language plpgsql
volatile
set search_path = ''
as $$
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    perform private.raise_rule('INVALID_INPUT', 'rows must be a JSON array');
  end if;
  -- serialise concurrent replaces for the same business
  perform 1 from public.businesses b where b.id = p_business_id for update;
  if not found then
    perform private.raise_not_found('business');
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_rows) as x(weekday smallint, opens_at time, closes_at time)
     where x.weekday is null or x.opens_at is null or x.closes_at is null
        or x.weekday not between 0 and 6 or x.closes_at <= x.opens_at
  ) then
    perform private.raise_rule('INVALID_HOURS', 'Each row needs weekday 0-6 and closes_at after opens_at');
  end if;

  if exists (
    with n as (
      select distinct r.weekday, r.opens_at, r.closes_at
        from jsonb_to_recordset(p_rows) as r(weekday smallint, opens_at time, closes_at time)
    )
    select 1 from n x join n y
        on x.weekday = y.weekday
       and (x.opens_at, x.closes_at) <> (y.opens_at, y.closes_at)
       and x.opens_at < y.closes_at and y.opens_at < x.closes_at
  ) then
    perform private.raise_rule('OVERLAPPING_HOURS', 'Opening hours on the same day overlap');
  end if;

  with n as (
    select distinct r.weekday, r.opens_at, r.closes_at
      from jsonb_to_recordset(p_rows) as r(weekday smallint, opens_at time, closes_at time)
  )
  delete from public.business_hours h
   where h.business_id = p_business_id
     and not exists (select 1 from n x
                      where x.weekday = h.weekday and x.opens_at = h.opens_at and x.closes_at = h.closes_at);

  with n as (
    select distinct r.weekday, r.opens_at, r.closes_at
      from jsonb_to_recordset(p_rows) as r(weekday smallint, opens_at time, closes_at time)
  )
  insert into public.business_hours (business_id, weekday, opens_at, closes_at)
  select p_business_id, x.weekday, x.opens_at, x.closes_at
    from n x
   where not exists (select 1 from public.business_hours h
                      where h.business_id = p_business_id and h.weekday = x.weekday
                        and h.opens_at = x.opens_at and h.closes_at = x.closes_at);

  return query
    select * from public.business_hours h
     where h.business_id = p_business_id
     order by h.weekday, h.opens_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9b. replace_staff_availability(p_rows: [{weekday, start_time, end_time}])
-- Same diff-based full replace. An empty array means "inherit business_hours".
-- -----------------------------------------------------------------------------
create or replace function public.replace_staff_availability(
  p_staff_id uuid,
  p_rows     jsonb
)
returns setof public.availability_rules
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_business uuid;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    perform private.raise_rule('INVALID_INPUT', 'rows must be a JSON array');
  end if;
  select s.business_id into v_business from public.staff s where s.id = p_staff_id for update;
  if not found then
    perform private.raise_not_found('staff');
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_rows) as x(weekday smallint, start_time time, end_time time)
     where x.weekday is null or x.start_time is null or x.end_time is null
        or x.weekday not between 0 and 6 or x.end_time <= x.start_time
  ) then
    perform private.raise_rule('INVALID_HOURS', 'Each rule needs weekday 0-6 and end_time after start_time');
  end if;

  if exists (
    with n as (
      select distinct r.weekday, r.start_time, r.end_time
        from jsonb_to_recordset(p_rows) as r(weekday smallint, start_time time, end_time time)
    )
    select 1 from n x join n y
        on x.weekday = y.weekday
       and (x.start_time, x.end_time) <> (y.start_time, y.end_time)
       and x.start_time < y.end_time and y.start_time < x.end_time
  ) then
    perform private.raise_rule('OVERLAPPING_HOURS', 'Working hours on the same day overlap');
  end if;

  with n as (
    select distinct r.weekday, r.start_time, r.end_time
      from jsonb_to_recordset(p_rows) as r(weekday smallint, start_time time, end_time time)
  )
  delete from public.availability_rules a
   where a.staff_id = p_staff_id
     and not exists (select 1 from n x
                      where x.weekday = a.weekday and x.start_time = a.start_time and x.end_time = a.end_time);

  with n as (
    select distinct r.weekday, r.start_time, r.end_time
      from jsonb_to_recordset(p_rows) as r(weekday smallint, start_time time, end_time time)
  )
  insert into public.availability_rules (business_id, staff_id, weekday, start_time, end_time)
  select v_business, p_staff_id, x.weekday, x.start_time, x.end_time
    from n x
   where not exists (select 1 from public.availability_rules a
                      where a.staff_id = p_staff_id and a.weekday = x.weekday
                        and a.start_time = x.start_time and a.end_time = x.end_time);

  return query
    select * from public.availability_rules a
     where a.staff_id = p_staff_id
     order by a.weekday, a.start_time;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9c. replace_staff_services
-- -----------------------------------------------------------------------------
create or replace function public.replace_staff_services(
  p_staff_id    uuid,
  p_service_ids uuid[]
)
returns setof public.staff_services
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_business uuid;
  v_ids      uuid[];
begin
  select s.business_id into v_business from public.staff s where s.id = p_staff_id for update;
  if not found then
    perform private.raise_not_found('staff');
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids
    from unnest(coalesce(p_service_ids, '{}')) as x
   where x is not null;

  if exists (
    select 1 from unnest(v_ids) as x
     where not exists (select 1 from public.services sv where sv.id = x and sv.business_id = v_business)
  ) then
    perform private.raise_not_found('service');
  end if;

  delete from public.staff_services ss
   where ss.staff_id = p_staff_id
     and not (ss.service_id = any (v_ids));

  insert into public.staff_services (business_id, staff_id, service_id)
  select v_business, p_staff_id, x from unnest(v_ids) as x
  on conflict (staff_id, service_id) do nothing;

  return query
    select * from public.staff_services ss
     where ss.staff_id = p_staff_id
     order by ss.service_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges: service_role only, except dashboard_summary (authenticated too).
-- -----------------------------------------------------------------------------
revoke all on function public.set_request_context(text, text) from public, anon, authenticated;
revoke all on function public.create_appointment(uuid, uuid, uuid, uuid, timestamptz, public.appointment_source, text, public.actor_type, text, text) from public, anon, authenticated;
revoke all on function public.reschedule_appointment(uuid, timestamptz, public.actor_type, text, uuid) from public, anon, authenticated;
revoke all on function public.cancel_appointment(uuid, public.actor_type, text, text) from public, anon, authenticated;
revoke all on function public.set_appointment_status(uuid, public.appointment_status, public.actor_type, text) from public, anon, authenticated;
revoke all on function public.check_in_appointment(uuid, text) from public, anon, authenticated;
revoke all on function public.upsert_client_by_phone(uuid, text, text) from public, anon, authenticated;
revoke all on function public.claim_due_reminders(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.dashboard_summary(date) from public, anon, authenticated;
revoke all on function public.replace_business_hours(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.replace_staff_availability(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.replace_staff_services(uuid, uuid[]) from public, anon, authenticated;

grant execute on function public.set_request_context(text, text) to service_role;
grant execute on function public.create_appointment(uuid, uuid, uuid, uuid, timestamptz, public.appointment_source, text, public.actor_type, text, text) to service_role;
grant execute on function public.reschedule_appointment(uuid, timestamptz, public.actor_type, text, uuid) to service_role;
grant execute on function public.cancel_appointment(uuid, public.actor_type, text, text) to service_role;
grant execute on function public.set_appointment_status(uuid, public.appointment_status, public.actor_type, text) to service_role;
grant execute on function public.check_in_appointment(uuid, text) to service_role;
grant execute on function public.upsert_client_by_phone(uuid, text, text) to service_role;
grant execute on function public.claim_due_reminders(timestamptz, integer) to service_role;
grant execute on function public.dashboard_summary(date) to authenticated, service_role;
grant execute on function public.replace_business_hours(uuid, jsonb) to service_role;
grant execute on function public.replace_staff_availability(uuid, jsonb) to service_role;
grant execute on function public.replace_staff_services(uuid, uuid[]) to service_role;

-- private helpers used by the RPCs above
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.current_org_id()      to authenticated, service_role;
grant execute on function private.current_business_id() to authenticated, service_role;
grant execute on all functions in schema private to service_role;
