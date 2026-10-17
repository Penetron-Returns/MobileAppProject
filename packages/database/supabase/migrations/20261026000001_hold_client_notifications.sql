-- =============================================================================
-- Act-then-undo: hold client notifications and void undone bookings.
--   * appointments.client_notify_after: while set, the client hears nothing about
--     the appointment (no creation message, no reminder). The hold cron
--     (/cron/client-notifications) claims due rows and clears the column.
--   * appointments.voided_at: the owner undid a Nerova-made booking. The row is
--     status 'cancelled' (frees the slot) and is excluded from stats and the
--     client-visible cancellation history.
--   * appointment_event_type gains 'voided' (own migration step: a new enum value
--     cannot be used in the transaction that adds it; the RPCs are in 20261026000002).
-- =============================================================================

alter type public.appointment_event_type add value if not exists 'voided';

alter table public.appointments
  add column if not exists client_notify_after timestamptz,
  add column if not exists voided_at timestamptz;

alter table public.appointments drop constraint if exists appointments_voided_check;
alter table public.appointments add constraint appointments_voided_check
  check (voided_at is null or status = 'cancelled');

-- Due scan: only held rows are indexed, so it stays tiny.
create index if not exists appointments_client_notify_due_idx
  on public.appointments (client_notify_after)
  where client_notify_after is not null;
