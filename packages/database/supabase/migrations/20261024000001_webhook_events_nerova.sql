-- Nerova approval webhooks (approval.requested) are deduplicated in webhook_events like Meta and Clerk.
alter table public.webhook_events drop constraint if exists webhook_events_source_check;
alter table public.webhook_events
  add constraint webhook_events_source_check check (source in ('whatsapp', 'clerk', 'nerova'));
