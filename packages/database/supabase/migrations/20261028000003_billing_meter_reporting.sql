-- =============================================================================
-- Usage reporting to the Stripe meter `booking_made` (extras are billed by Stripe: graduated metered
-- prices with the plan's allowance at R0, then R4 each). EVERY booking made counts, whatever its source or
-- outcome (completed, no_show, cancelled): one meter event per appointment row, sent when it is created.
-- A reschedule updates the same row (reschedule_appointment), so it never adds an event.
--   * appointments.billing_reported_at: set once the booking was sent to the meter
--   * billing_subscriptions.reporting_started_at: set when a business first becomes entitled; bookings created
--     before it are never reported (otherwise the first sweep would bill the whole history)
--   * billing_unreported_bookings(): the sweep's worklist: bookings created after p_created_after, not yet
--     reported, of businesses with an entitled subscription. mark_bookings_billed(): stamps them. Service role only.
-- =============================================================================

alter table public.appointments add column if not exists billing_reported_at timestamptz;
alter table public.billing_subscriptions add column if not exists reporting_started_at timestamptz;

create index if not exists appointments_unreported_billing_idx
  on public.appointments (created_at)
  where billing_reported_at is null;

-- Usage counts a business's bookings by creation time
create index if not exists appointments_business_created_idx
  on public.appointments (business_id, created_at);

create or replace function public.billing_unreported_bookings(p_created_after timestamptz, p_limit integer default 500)
returns table (appointment_id uuid, business_id uuid, stripe_customer_id text, created_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select a.id, a.business_id, s.stripe_customer_id, a.created_at
    from public.appointments a
    join public.billing_subscriptions s on s.business_id = a.business_id
   where a.billing_reported_at is null
     and a.created_at > p_created_after
     and s.status in ('active', 'trialing', 'past_due')
     and s.reporting_started_at is not null
     and a.created_at >= s.reporting_started_at
   order by a.created_at, a.id
   limit greatest(p_limit, 0);
$$;

create or replace function public.mark_bookings_billed(p_ids uuid[], p_at timestamptz)
returns integer
language sql
volatile
set search_path = ''
as $$
  with updated as (
    update public.appointments
       set billing_reported_at = p_at
     where id = any (p_ids) and billing_reported_at is null
    returning 1
  )
  select count(*)::integer from updated;
$$;

revoke all on function public.billing_unreported_bookings(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.mark_bookings_billed(uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.billing_unreported_bookings(timestamptz, integer) to service_role;
grant execute on function public.mark_bookings_billed(uuid[], timestamptz) to service_role;
