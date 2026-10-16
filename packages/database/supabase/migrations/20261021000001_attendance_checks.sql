-- =============================================================================
-- Attendance check: after an appointment ends, ask the right person whether the
-- client came, and set completed / no_show from the answer (never automatically).
--   * businesses.attendance_mode   'staff' (default) | 'owner': who answers
--   * attendance_checks            one pending question per appointment
--   * attendance_pushes            push log: 30 min rate limit, batching, end-of-day dedupe
--   * attendance_due_appointments  anti-join the cron job uses to find unasked appointments
-- Writes come only from the service role (API + cron). Authenticated users get a
-- business-scoped SELECT on attendance_checks (Realtime invalidation); the push
-- log is service role only.
-- =============================================================================

-- 1. Business setting ---------------------------------------------------------
alter table public.businesses
  add column if not exists attendance_mode text not null default 'staff'
    constraint businesses_attendance_mode_check check (attendance_mode in ('staff', 'owner'));

-- 2. attendance_checks --------------------------------------------------------
create table if not exists public.attendance_checks (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses (id) on delete cascade,
  appointment_id    uuid not null,
  -- who the question was addressed to when it was created
  audience          text not null check (audience in ('staff', 'owner')),
  -- staff mode: the user linked to the appointment's staff member (null = nobody linked)
  recipient_user_id text references public.users (id) on delete set null,
  status            text not null default 'pending' check (status in ('pending', 'answered')),
  -- resolved_elsewhere: the appointment left `confirmed` by another route before an answer
  outcome           text check (outcome in ('came', 'no_show', 'resolved_elsewhere')),
  created_at        timestamptz not null default now(),
  notified_at       timestamptz,
  escalated_at      timestamptz,
  answered_at       timestamptz,
  answered_by       text,
  constraint attendance_checks_appointment_key unique (appointment_id),
  constraint attendance_checks_appointment_fkey foreign key (business_id, appointment_id)
    references public.appointments (business_id, id) on delete cascade,
  constraint attendance_checks_answer_check check (
    (status = 'pending' and outcome is null and answered_at is null and answered_by is null)
    or (status = 'answered' and outcome is not null and answered_at is not null)
  )
);
create index if not exists attendance_checks_pending_idx
  on public.attendance_checks (business_id, created_at) where status = 'pending';
create index if not exists attendance_checks_recipient_idx
  on public.attendance_checks (recipient_user_id) where status = 'pending';

-- 3. attendance_pushes (push log) ---------------------------------------------
create table if not exists public.attendance_pushes (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id     text not null,
  kind        text not null check (kind in ('check', 'batch', 'summary')),
  check_ids   uuid[] not null default '{}',
  -- business-local calendar date of the send (end-of-day summary dedupe)
  local_date  date not null,
  sent_at     timestamptz not null default now()
);
create index if not exists attendance_pushes_user_idx
  on public.attendance_pushes (business_id, user_id, sent_at desc);

-- 4. RLS and grants -----------------------------------------------------------
alter table public.attendance_checks enable row level security;
alter table public.attendance_pushes enable row level security;

revoke all on public.attendance_checks, public.attendance_pushes from anon, authenticated;
grant select on public.attendance_checks to authenticated;
grant all on public.attendance_checks, public.attendance_pushes to service_role;

drop policy if exists members_select on public.attendance_checks;
create policy members_select on public.attendance_checks
  for select to authenticated
  using (business_id = (select private.current_business_id()));
-- attendance_pushes: RLS on, no policies, no grants = service role only.

-- 5. Realtime (guarded like 20260924000006) -----------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publication supabase_realtime not found; skipping realtime setup';
    return;
  end if;
  if (select puballtables from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attendance_checks') then
    alter publication supabase_realtime add table public.attendance_checks;
  end if;
end
$$;

-- 6. Finder for appointments that need a question or a silent completion ------
create index if not exists appointments_confirmed_ends_at_idx
  on public.appointments (ends_at) where status = 'confirmed';

create or replace function public.attendance_due_appointments(
  p_ended_before timestamptz,
  p_ended_after  timestamptz,
  p_limit        integer
)
returns table (
  business_id      uuid,
  appointment_id   uuid,
  starts_at        timestamptz,
  ends_at          timestamptz,
  checked_in_at    timestamptz,
  staff_user_id    text,
  client_name      text,
  service_name     text
)
language sql
stable
set search_path = ''
as $$
  select a.business_id, a.id, a.starts_at, a.ends_at, a.checked_in_at, st.user_id, c.name, s.name
    from public.appointments a
    join public.staff    st on st.business_id = a.business_id and st.id = a.staff_id
    join public.clients  c  on c.business_id  = a.business_id and c.id  = a.client_id
    join public.services s  on s.business_id  = a.business_id and s.id  = a.service_id
   where a.status = 'confirmed'
     and a.ends_at <= p_ended_before
     and a.ends_at >  p_ended_after
     and not exists (select 1 from public.attendance_checks ac where ac.appointment_id = a.id)
   order by a.ends_at, a.id
   limit greatest(p_limit, 0);
$$;

revoke all on function public.attendance_due_appointments(timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.attendance_due_appointments(timestamptz, timestamptz, integer) to service_role;
