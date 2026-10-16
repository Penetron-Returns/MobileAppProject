-- =============================================================================
-- Device voice tokens: a scoped, long-lived credential for "Hey Clovie" while the app is in the
-- background or killed, when no Clerk session token can be minted.
--   * Opaque random token (`cvt_` + 32 bytes base64url), shown to the app once; only its SHA-256 hex
--     hash is stored.
--   * The API accepts it ONLY on POST /v1/voice/transcriptions and POST /v1/attendance/:id/answer.
--   * One live token per (user, device_label): minting a new one revokes the previous.
-- Service role only: RLS is on with NO policies, so `authenticated` and `anon` see nothing.
-- =============================================================================
create table if not exists public.voice_device_tokens (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  user_id       text not null references public.users (id) on delete cascade,
  token_hash    text not null,
  device_label  text not null default 'default' check (char_length(device_label) between 1 and 80),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  constraint voice_device_tokens_token_hash_key unique (token_hash)
);

-- The live token of a user's device (rotation looks it up).
create index if not exists voice_device_tokens_live_idx
  on public.voice_device_tokens (user_id, device_label) where revoked_at is null;

alter table public.voice_device_tokens enable row level security;
-- Deliberately no policy and no grants beyond the defaults: only the service role reads or writes.
revoke all on public.voice_device_tokens from anon, authenticated;
