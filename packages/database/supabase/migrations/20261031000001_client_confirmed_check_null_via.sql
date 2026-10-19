-- Fix appointments_client_confirmed_check (added in 20261022000001): with a confirmation time
-- and a NULL channel, `client_confirmed_via in (...)` evaluates to NULL, and a CHECK treats
-- NULL as passing, so "time without channel" was accepted. Require the channel explicitly.
-- Re-runnable: drops and re-adds the constraint. The RPC always sets both columns, so no
-- existing row can violate it.
alter table public.appointments
  drop constraint if exists appointments_client_confirmed_check;
alter table public.appointments
  add constraint appointments_client_confirmed_check check (
    (client_confirmed_at is null and client_confirmed_via is null)
    or (client_confirmed_at is not null and client_confirmed_via is not null
        and client_confirmed_via in ('whatsapp', 'sms', 'web', 'app'))
  );
