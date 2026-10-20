-- =============================================================================
-- Client confirmation write-back: a client tapped "Confirm" on a reminder
-- (Nerova WhatsApp reminders; later sms / web / app).
--   * appointments.client_confirmed_at / client_confirmed_via: both null or both set
--   * appointment_event_type 'client_confirmed'
--   * confirm_appointment_by_client RPC: idempotent, business-scoped, only for
--     status 'confirmed'; anything else returns the row unchanged
-- appointments already has table-level SELECT for authenticated (business-scoped
-- members_select policy), so the new columns are readable without a new grant.
-- =============================================================================

alter type public.appointment_event_type add value if not exists 'client_confirmed';

alter table public.appointments
  add column if not exists client_confirmed_at  timestamptz,
  add column if not exists client_confirmed_via text;

alter table public.appointments
  drop constraint if exists appointments_client_confirmed_check;
alter table public.appointments
  add constraint appointments_client_confirmed_check check (
    (client_confirmed_at is null and client_confirmed_via is null)
    or (client_confirmed_at is not null and client_confirmed_via in ('whatsapp', 'sms', 'web', 'app'))
  );

create or replace function public.confirm_appointment_by_client(
  p_business_id     uuid,
  p_appointment_id  uuid,
  p_confirmed_at    timestamptz,
  p_via             text,
  p_actor           public.actor_type,
  p_actor_id        text,
  p_idempotency_key text
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
  p_idempotency_key := nullif(btrim(p_idempotency_key), '');
  if p_actor is null or p_confirmed_at is null then
    perform private.raise_rule('INVALID_INPUT', 'actor and confirmed_at are required');
  end if;
  if p_via is null or p_via not in ('whatsapp', 'sms', 'web', 'app') then
    perform private.raise_rule('INVALID_INPUT', 'via must be whatsapp, sms, web or app');
  end if;

  select * into v_appt from public.appointments a
   where a.id = p_appointment_id and a.business_id = p_business_id
   for update;
  if not found then
    perform private.raise_not_found('appointment');
  end if;

  -- Not confirmed (cancelled, completed, no_show), already confirmed by the client,
  -- or this key already applied: nothing to do.
  if v_appt.status <> 'confirmed' or v_appt.client_confirmed_at is not null then
    return v_appt;
  end if;
  if p_idempotency_key is not null and exists (
       select 1 from public.appointment_events ev
        where ev.appointment_id = v_appt.id and ev.type = 'client_confirmed'
          and ev.payload ->> 'idempotency_key' = p_idempotency_key) then
    return v_appt;
  end if;

  update public.appointments a
     set client_confirmed_at = p_confirmed_at, client_confirmed_via = p_via
   where a.id = v_appt.id
  returning * into v_row;

  insert into public.appointment_events (business_id, appointment_id, type, actor, actor_id, payload)
  values (v_row.business_id, v_row.id, 'client_confirmed', p_actor, p_actor_id,
          jsonb_build_object('via', p_via, 'confirmed_at', private.iso_utc(p_confirmed_at),
                             'idempotency_key', p_idempotency_key));
  return v_row;
end;
$$;

revoke all on function public.confirm_appointment_by_client(uuid, uuid, timestamptz, text, public.actor_type, text, text) from public, anon, authenticated;
grant execute on function public.confirm_appointment_by_client(uuid, uuid, timestamptz, text, public.actor_type, text, text) to service_role;
