-- =============================================================================
-- Nerova connector: attribute Pip's bookings.
-- Bookings and audit rows created through the Nerova Booking connector carry
-- source = 'nerova' and actor = 'nerova' (actor_id = the connection) so staff
-- and the research exports can tell them from WhatsApp-menu, app and web ones.
-- ALTER TYPE ... ADD VALUE is additive and idempotent; the new labels are not
-- used inside this migration.
-- =============================================================================
alter type public.appointment_source add value if not exists 'nerova';
alter type public.actor_type add value if not exists 'nerova';
