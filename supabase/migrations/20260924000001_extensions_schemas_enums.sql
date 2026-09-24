-- =============================================================================
-- 0001 · Extensions, schemas and enums
-- BUILD_PLAN §3 "Extensions", "Schemas", "Enums".
-- pg_cron / pg_net live in a separate, guarded migration (…000007_cron.sql).
-- =============================================================================

-- Supabase installs extensions into the `extensions` schema. Create it if we
-- are on plain Postgres so the same migration works everywhere.
create schema if not exists extensions;

create extension if not exists pgcrypto   with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists citext     with schema extensions;

-- Helpers (current_business_id(), audit trigger fn, cron invoker) live here.
-- Not exposed through PostgREST.
create schema if not exists private;
revoke all on schema private from public;

-- -----------------------------------------------------------------------------
-- Enums (guarded so re-running the migration is harmless)
-- -----------------------------------------------------------------------------
do $$
declare
  v_enum record;
begin
  for v_enum in
    select * from (values
      ('member_role',            array['owner','staff']),
      ('appointment_status',     array['confirmed','cancelled','completed','no_show']),
      ('appointment_source',     array['whatsapp','app','web']),
      ('appointment_event_type', array['created','rescheduled','cancelled','completed','no_show',
                                       'checked_in','reminder_sent','confirmation_sent','notes_updated']),
      ('actor_type',             array['customer','staff','system']),
      ('wa_account_status',      array['pending','live','needs_reauth','disconnected','paused']),
      ('template_status',        array['draft','submitted','approved','rejected','paused','disabled']),
      ('message_direction',      array['in','out']),
      ('message_type',           array['text','interactive','flow','template','button','reaction','media','unknown']),
      ('message_status',         array['received','queued','sent','delivered','read','failed']),
      ('escalation_status',      array['open','resolved']),
      ('booking_channel',        array['whatsapp','web','app']),
      ('attempt_outcome',        array['in_progress','completed','abandoned','failed'])
    ) as t(name, labels)
  loop
    if not exists (
      select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typname = v_enum.name
    ) then
      execute format(
        'create type public.%I as enum (%s)',
        v_enum.name,
        (select string_agg(quote_literal(l), ', ') from unnest(v_enum.labels) as l)
      );
    end if;
  end loop;
end
$$;
