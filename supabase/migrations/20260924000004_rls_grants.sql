-- =============================================================================
-- 0004 · Row-level security and privileges
-- BUILD_PLAN §3 "RLS" and rule 2 ("the app gets SELECT only").
--
--   anon           → nothing at all (public web booking goes through the API)
--   authenticated  → SELECT on its own business's rows, nothing else
--                    (whatsapp_accounts minus access_token_ciphertext;
--                     no access to webhook_events / idempotency_keys)
--   service_role   → everything (bypasses RLS; used only by the API)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Default privileges: Supabase grants ALL on new tables/functions/sequences in
-- `public` to anon + authenticated. Undo that for objects this role creates
-- from now on; every grant below is explicit.
-- -----------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
alter default privileges in schema private revoke all on functions from public;

grant usage on schema public to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Table privileges
-- -----------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;

grant select on
  public.businesses,
  public.users,
  public.staff,
  public.services,
  public.staff_services,
  public.business_hours,
  public.availability_rules,
  public.availability_overrides,
  public.clients,
  public.client_notes,
  public.appointments,
  public.appointment_events,
  public.audit_log,
  public.message_templates,
  public.conversations,
  public.messages,
  public.escalations,
  public.booking_attempts,
  public.device_push_tokens
to authenticated;

-- Column-level grant: the Meta token ciphertext is never readable by the app.
-- (The app must select explicit columns from whatsapp_accounts; `select *`
-- is rejected with "permission denied".)
grant select (
  id, business_id, waba_id, phone_number_id, display_phone, verified_name,
  token_expires_at, flow_ids, status, quality_rating, messaging_limit,
  last_health_check_at, last_error, created_at, updated_at
) on public.whatsapp_accounts to authenticated;

-- -----------------------------------------------------------------------------
-- Helper schema: authenticated needs to call the tenant helpers from policies.
-- -----------------------------------------------------------------------------
grant usage on schema private to authenticated, service_role;
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.current_org_id()      to authenticated, service_role;
grant execute on function private.current_business_id() to authenticated, service_role;
grant execute on all functions in schema private to service_role;

-- -----------------------------------------------------------------------------
-- RLS: enable everywhere; SELECT-only policies for authenticated.
-- No policies at all on webhook_events / idempotency_keys (service role only).
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'businesses', 'users', 'staff', 'services', 'staff_services', 'business_hours',
    'availability_rules', 'availability_overrides', 'clients', 'client_notes',
    'appointments', 'appointment_events', 'audit_log', 'whatsapp_accounts',
    'message_templates', 'conversations', 'messages', 'webhook_events', 'escalations',
    'idempotency_keys', 'booking_attempts', 'device_push_tokens'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;

  foreach t in array array[
    'users', 'staff', 'services', 'staff_services', 'business_hours',
    'availability_rules', 'availability_overrides', 'clients', 'client_notes',
    'appointments', 'appointment_events', 'audit_log', 'whatsapp_accounts',
    'message_templates', 'conversations', 'messages', 'escalations', 'booking_attempts'
  ]
  loop
    execute format('drop policy if exists members_select on public.%I', t);
    execute format(
      'create policy members_select on public.%I
         for select to authenticated
         using (business_id = (select private.current_business_id()))', t);
  end loop;
end
$$;

drop policy if exists members_select on public.businesses;
create policy members_select on public.businesses
  for select to authenticated
  using (id = (select private.current_business_id()));

-- Push tokens: members only see their own devices.
drop policy if exists members_select on public.device_push_tokens;
create policy members_select on public.device_push_tokens
  for select to authenticated
  using (
    business_id = (select private.current_business_id())
    and user_id = (select auth.jwt() ->> 'sub')
  );
