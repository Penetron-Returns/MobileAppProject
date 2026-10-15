-- =============================================================================
-- Hours and availability model
--
-- Rule order (docs/booking-core.md): business hours (ONE range per weekday) →
-- special days (business-wide, per date) → staff hours (ONE range per weekday,
-- zero rules inherit) → staff breaks → staff time off → appointments/lead time.
--
--   business_special_days  named per-date closure or replaced hours (holidays)
--   staff_breaks           named recurring breaks (weekdays empty = every day)
--   staff_time_off         date-range absences, all-day or partial
--   availability_overrides now per-STAFF day overrides only (business-wide rows
--                          were converted into business_special_days)
--
-- Existing split days are converted, not dropped: see section 4. Safe to re-apply.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Types and tables
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'public' and t.typname = 'special_day_kind') then
    create type public.special_day_kind as enum ('public_holiday', 'closure', 'special_hours');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'public' and t.typname = 'time_off_reason') then
    create type public.time_off_reason as enum ('leave', 'sick', 'training', 'other');
  end if;
end
$$;

create table if not exists public.business_special_days (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  date        date not null,
  name        text not null,
  kind        public.special_day_kind not null,
  is_closed   boolean not null default true,
  start_time  time,
  end_time    time,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint business_special_days_name_check check (char_length(btrim(name)) between 1 and 120),
  -- closed: no hours; open: one valid replacement range inside the day
  constraint business_special_days_window_check check (
    (is_closed and start_time is null and end_time is null)
    or (not is_closed and start_time is not null and end_time is not null
        and start_time >= time '00:00' and end_time <= time '24:00' and end_time > start_time)
  ),
  -- a closure is closed, special hours are open, a public holiday may be either
  constraint business_special_days_kind_check check (
    kind = 'public_holiday' or (kind = 'closure' and is_closed) or (kind = 'special_hours' and not is_closed)
  )
);
-- one special day per date; also the (business_id, date) lookup index
create unique index if not exists business_special_days_business_date_key
  on public.business_special_days (business_id, date);

create table if not exists public.staff_breaks (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  staff_id    uuid not null,
  label       text not null default 'Break',
  start_time  time not null,
  end_time    time not null,
  -- 0 = Sunday … 6 = Saturday; empty = every day the staff member works
  weekdays    smallint[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint staff_breaks_label_check check (char_length(btrim(label)) between 1 and 60),
  constraint staff_breaks_window_check check (
    start_time >= time '00:00' and end_time <= time '24:00' and end_time > start_time
  ),
  constraint staff_breaks_weekdays_check check (weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  constraint staff_breaks_staff_id_fkey foreign key (business_id, staff_id)
    references public.staff (business_id, id) on delete cascade
);
create index if not exists staff_breaks_staff_idx on public.staff_breaks (business_id, staff_id);

create table if not exists public.staff_time_off (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  staff_id    uuid not null,
  starts_on   date not null,
  ends_on     date not null,
  -- both null = all day on every date of the range; both set = those hours on each date
  start_time  time,
  end_time    time,
  reason      public.time_off_reason not null default 'other',
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint staff_time_off_range_check check (ends_on >= starts_on and ends_on - starts_on <= 366),
  constraint staff_time_off_window_check check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null
        and start_time >= time '00:00' and end_time <= time '24:00' and end_time > start_time)
  ),
  constraint staff_time_off_note_check check (note is null or char_length(note) <= 500),
  constraint staff_time_off_staff_id_fkey foreign key (business_id, staff_id)
    references public.staff (business_id, id) on delete cascade
);
create index if not exists staff_time_off_staff_idx on public.staff_time_off (business_id, staff_id, starts_on, ends_on);
create index if not exists staff_time_off_business_idx on public.staff_time_off (business_id, starts_on, ends_on);

-- -----------------------------------------------------------------------------
-- 2. Break overlap guard: no two breaks of a staff member share a weekday and a time.
-- Locks the staff row so concurrent inserts for one staff member serialise.
-- -----------------------------------------------------------------------------
create or replace function private.guard_staff_break()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.weekdays := coalesce(
    (select array_agg(distinct w order by w) from unnest(new.weekdays) as w), '{}'::smallint[]);
  perform 1 from public.staff s where s.id = new.staff_id for update;
  if exists (
    select 1 from public.staff_breaks b
     where b.staff_id = new.staff_id
       and b.id <> new.id
       and b.start_time < new.end_time and new.start_time < b.end_time
       and (cardinality(b.weekdays) = 0 or cardinality(new.weekdays) = 0 or b.weekdays && new.weekdays)
  ) then
    perform private.raise_rule('OVERLAPPING_BREAKS', 'Breaks on the same day overlap');
  end if;
  return new;
end;
$$;

drop trigger if exists guard_staff_break on public.staff_breaks;
create trigger guard_staff_break before insert or update on public.staff_breaks
  for each row execute function private.guard_staff_break();

-- -----------------------------------------------------------------------------
-- 3. updated_at, audit, RLS and grants for the new tables
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['business_special_days', 'staff_breaks', 'staff_time_off']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I
                      for each row execute function private.set_updated_at()', t);
    execute format('drop trigger if exists audit_row_change on public.%I', t);
    execute format('create trigger audit_row_change after insert or update or delete on public.%I
                      for each row execute function private.audit_row_change()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists members_select on public.%I', t);
    execute format('create policy members_select on public.%I for select to authenticated
                      using (business_id = (select private.current_business_id()))', t);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 4. Convert the old split-day model (private.convert_split_availability, safe to
-- re-run). Minutes after midnight in int4multirange: merge = range_agg, clip = *,
-- gaps = -. Nothing previously unbookable becomes bookable: every gap becomes a
-- "Lunch" break for each affected staff member.
-- -----------------------------------------------------------------------------
create or replace function private.time_to_mins(t time) returns integer
language sql immutable set search_path = '' as $$ select (extract(epoch from t) / 60)::integer $$;

create or replace function private.mins_to_time(m integer) returns time
language sql immutable set search_path = '' as $$ select make_time(m / 60, m % 60, 0) $$;

create or replace function private.convert_split_availability()
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  b record;
  s record;
  d record;
  v_biz  int4multirange;
  v_own  int4multirange;
  v_eff  int4multirange;
  v_gap  int4multirange;
  v_win  int4multirange;
  v_has_rules boolean;
  g int4range;
begin
  create temporary table if not exists _conv_breaks (
    business_id uuid, staff_id uuid, weekday smallint, start_min int, end_min int
  ) on commit drop;
  truncate _conv_breaks;

  -- 4a. gaps per (staff, weekday): bookable = span(own) ∩ span(business) minus breaks
  for b in select distinct business_id, weekday from public.business_hours loop
    select range_agg(int4range(private.time_to_mins(h.opens_at), private.time_to_mins(h.closes_at)))
      into v_biz
      from public.business_hours h where h.business_id = b.business_id and h.weekday = b.weekday;

    for s in select id from public.staff where business_id = b.business_id loop
      select exists (select 1 from public.availability_rules r where r.staff_id = s.id) into v_has_rules;
      if v_has_rules then
        select coalesce(range_agg(int4range(private.time_to_mins(r.start_time), private.time_to_mins(r.end_time))), '{}'::int4multirange)
          into v_own
          from public.availability_rules r where r.staff_id = s.id and r.weekday = b.weekday;
      else
        v_own := v_biz;
      end if;
      v_eff := v_own * v_biz;
      if isempty(v_eff) then
        continue;
      end if;
      v_gap := int4multirange(int4range(lower(v_own), upper(v_own)) * int4range(lower(v_biz), upper(v_biz))) - v_eff;
      for g in select unnest(v_gap) loop
        insert into _conv_breaks values (b.business_id, s.id, b.weekday, lower(g), upper(g));
      end loop;
    end loop;
  end loop;

  insert into public.staff_breaks (business_id, staff_id, label, start_time, end_time, weekdays)
  select c.business_id, c.staff_id, 'Lunch', private.mins_to_time(c.start_min), private.mins_to_time(c.end_min),
         array_agg(c.weekday order by c.weekday)
    from _conv_breaks c
   group by c.business_id, c.staff_id, c.start_min, c.end_min;

  -- 4b. business hours: earliest open to latest close, one row per weekday
  update public.business_hours h
     set opens_at = m.lo, closes_at = m.hi
    from (select business_id, weekday, min(opens_at) as lo, max(closes_at) as hi, min(id::text)::uuid as keep_id
            from public.business_hours group by business_id, weekday having count(*) > 1) m
   where h.business_id = m.business_id and h.weekday = m.weekday and h.id = m.keep_id;
  delete from public.business_hours h
   using (select business_id, weekday, min(id::text)::uuid as keep_id
            from public.business_hours group by business_id, weekday having count(*) > 1) m
   where h.business_id = m.business_id and h.weekday = m.weekday and h.id <> m.keep_id;

  -- 4c. staff hours: same
  update public.availability_rules a
     set start_time = m.lo, end_time = m.hi
    from (select staff_id, weekday, min(start_time) as lo, max(end_time) as hi, min(id::text)::uuid as keep_id
            from public.availability_rules group by staff_id, weekday having count(*) > 1) m
   where a.staff_id = m.staff_id and a.weekday = m.weekday and a.id = m.keep_id;
  delete from public.availability_rules a
   using (select staff_id, weekday, min(id::text)::uuid as keep_id
            from public.availability_rules group by staff_id, weekday having count(*) > 1) m
   where a.staff_id = m.staff_id and a.weekday = m.weekday and a.id <> m.keep_id;

  -- 4d. business-wide overrides → special days. A closed row wins; open rows become the
  -- span of their windows, with any gap kept closed through partial staff time off.
  for d in
    select o.business_id, o.date,
           bool_or(o.is_closed) as closed,
           (array_agg(o.reason order by o.created_at) filter (where nullif(btrim(o.reason), '') is not null))[1] as reason
      from public.availability_overrides o
     where o.staff_id is null
     group by o.business_id, o.date
  loop
    if d.closed then
      insert into public.business_special_days (business_id, date, name, kind, is_closed)
      values (d.business_id, d.date, left(coalesce(d.reason, 'Closed'), 120), 'closure', true)
      on conflict (business_id, date) do nothing;
    else
      select range_agg(int4range(private.time_to_mins(o.start_time), private.time_to_mins(o.end_time)))
        into v_win
        from public.availability_overrides o
       where o.business_id = d.business_id and o.staff_id is null and o.date = d.date and not o.is_closed;
      insert into public.business_special_days (business_id, date, name, kind, is_closed, start_time, end_time)
      values (d.business_id, d.date, left(coalesce(d.reason, 'Special hours'), 120), 'special_hours', false,
              private.mins_to_time(lower(v_win)), private.mins_to_time(upper(v_win)))
      on conflict (business_id, date) do nothing;
      v_gap := int4multirange(int4range(lower(v_win), upper(v_win))) - v_win;
      for g in select unnest(v_gap) loop
        for s in select id from public.staff where business_id = d.business_id loop
          insert into public.staff_time_off (business_id, staff_id, starts_on, ends_on, start_time, end_time, reason, note)
          values (d.business_id, s.id, d.date, d.date, private.mins_to_time(lower(g)), private.mins_to_time(upper(g)),
                  'other', 'Converted from split special hours');
        end loop;
      end loop;
    end if;
  end loop;
  delete from public.availability_overrides where staff_id is null;
end;
$$;

revoke all on function private.time_to_mins(time), private.mins_to_time(integer),
  private.convert_split_availability(), private.guard_staff_break() from public, anon, authenticated;
grant execute on function private.time_to_mins(time), private.mins_to_time(integer),
  private.convert_split_availability(), private.guard_staff_break() to service_role;

select private.convert_split_availability();
alter table public.availability_overrides alter column staff_id set not null;

-- -----------------------------------------------------------------------------
-- 5. One range per weekday, enforced
-- -----------------------------------------------------------------------------
drop index if exists public.business_hours_business_weekday_idx;
drop index if exists public.availability_rules_staff_weekday_idx;
create unique index if not exists business_hours_business_weekday_key
  on public.business_hours (business_id, weekday);
create unique index if not exists availability_rules_staff_weekday_key
  on public.availability_rules (staff_id, weekday);

-- -----------------------------------------------------------------------------
-- 6. Atomic replace functions
-- -----------------------------------------------------------------------------
-- replace_business_hours(p_rows: [{weekday, opens_at, closes_at}]): one range per
-- weekday, diff-applied by weekday so a changed range keeps its row id.
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
    select 1 from jsonb_to_recordset(p_rows) as r(weekday smallint, opens_at time, closes_at time)
     group by r.weekday having count(distinct (r.opens_at, r.closes_at)) > 1
  ) then
    perform private.raise_rule('ONE_RANGE_PER_DAY', 'Opening hours allow one range per weekday; use a staff break for a lunch gap');
  end if;

  delete from public.business_hours h
   where h.business_id = p_business_id
     and not exists (select 1 from jsonb_to_recordset(p_rows) as r(weekday smallint, opens_at time, closes_at time)
                      where r.weekday = h.weekday);

  insert into public.business_hours (business_id, weekday, opens_at, closes_at)
  select distinct p_business_id, r.weekday, r.opens_at, r.closes_at
    from jsonb_to_recordset(p_rows) as r(weekday smallint, opens_at time, closes_at time)
  on conflict (business_id, weekday) do update
    set opens_at = excluded.opens_at, closes_at = excluded.closes_at
    where (public.business_hours.opens_at, public.business_hours.closes_at)
          is distinct from (excluded.opens_at, excluded.closes_at);

  return query
    select * from public.business_hours h
     where h.business_id = p_business_id
     order by h.weekday;
end;
$$;

-- replace_staff_availability(p_rows: [{weekday, start_time, end_time}]): one range
-- per weekday. An empty array means "inherit business hours".
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
    select 1 from jsonb_to_recordset(p_rows) as r(weekday smallint, start_time time, end_time time)
     group by r.weekday having count(distinct (r.start_time, r.end_time)) > 1
  ) then
    perform private.raise_rule('ONE_RANGE_PER_DAY', 'Working hours allow one range per weekday; use a break for a gap');
  end if;

  delete from public.availability_rules a
   where a.staff_id = p_staff_id
     and not exists (select 1 from jsonb_to_recordset(p_rows) as r(weekday smallint, start_time time, end_time time)
                      where r.weekday = a.weekday);

  insert into public.availability_rules (business_id, staff_id, weekday, start_time, end_time)
  select distinct v_business, p_staff_id, r.weekday, r.start_time, r.end_time
    from jsonb_to_recordset(p_rows) as r(weekday smallint, start_time time, end_time time)
  on conflict (staff_id, weekday) do update
    set start_time = excluded.start_time, end_time = excluded.end_time
    where (public.availability_rules.start_time, public.availability_rules.end_time)
          is distinct from (excluded.start_time, excluded.end_time);

  return query
    select * from public.availability_rules a
     where a.staff_id = p_staff_id
     order by a.weekday;
end;
$$;

-- replace_staff_breaks(p_rows: [{label, start_time, end_time, weekdays}]): atomic
-- full replace, diff-applied on (label, window, weekdays). weekdays absent or []
-- means every working day. Overlapping breaks are rejected.
create or replace function public.replace_staff_breaks(
  p_staff_id uuid,
  p_rows     jsonb
)
returns setof public.staff_breaks
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_business uuid;
  v_new      jsonb;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    perform private.raise_rule('INVALID_INPUT', 'rows must be a JSON array');
  end if;
  select s.business_id into v_business from public.staff s where s.id = p_staff_id for update;
  if not found then
    perform private.raise_not_found('staff');
  end if;

  -- normalised, de-duplicated rows: default label, sorted distinct weekdays
  select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) into v_new
    from (
      select distinct coalesce(nullif(btrim(r.label), ''), 'Break') as label, r.start_time, r.end_time,
             coalesce((select array_agg(distinct w order by w) from unnest(r.weekdays) as w), '{}'::smallint[]) as weekdays
        from jsonb_to_recordset(p_rows) as r(label text, start_time time, end_time time, weekdays smallint[])
    ) n;

  if exists (
    select 1 from jsonb_to_recordset(v_new) as n(label text, start_time time, end_time time, weekdays smallint[])
     where n.start_time is null or n.end_time is null or n.end_time <= n.start_time
        or char_length(n.label) > 60 or not (n.weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
  ) then
    perform private.raise_rule('INVALID_BREAK', 'Each break needs start_time before end_time and weekdays 0-6');
  end if;

  if exists (
    with n as (
      select * from jsonb_to_recordset(v_new) as n(label text, start_time time, end_time time, weekdays smallint[])
    )
    select 1 from n x join n y
        on (x.label, x.start_time, x.end_time, x.weekdays) < (y.label, y.start_time, y.end_time, y.weekdays)
       and x.start_time < y.end_time and y.start_time < x.end_time
       and (cardinality(x.weekdays) = 0 or cardinality(y.weekdays) = 0 or x.weekdays && y.weekdays)
  ) then
    perform private.raise_rule('OVERLAPPING_BREAKS', 'Breaks on the same day overlap');
  end if;

  delete from public.staff_breaks b
   where b.staff_id = p_staff_id
     and not exists (select 1 from jsonb_to_recordset(v_new) as n(label text, start_time time, end_time time, weekdays smallint[])
                      where n.label = b.label and n.start_time = b.start_time
                        and n.end_time = b.end_time and n.weekdays = b.weekdays);

  insert into public.staff_breaks (business_id, staff_id, label, start_time, end_time, weekdays)
  select v_business, p_staff_id, n.label, n.start_time, n.end_time, n.weekdays
    from jsonb_to_recordset(v_new) as n(label text, start_time time, end_time time, weekdays smallint[])
   where not exists (select 1 from public.staff_breaks b
                      where b.staff_id = p_staff_id and n.label = b.label and n.start_time = b.start_time
                        and n.end_time = b.end_time and n.weekdays = b.weekdays);

  return query
    select * from public.staff_breaks b
     where b.staff_id = p_staff_id
     order by b.start_time, b.label, b.id;
end;
$$;

revoke all on function public.replace_staff_breaks(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_staff_breaks(uuid, jsonb) to service_role;
revoke all on function public.replace_business_hours(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.replace_staff_availability(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_business_hours(uuid, jsonb) to service_role;
grant execute on function public.replace_staff_availability(uuid, jsonb) to service_role;
