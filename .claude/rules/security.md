# Security and privacy

- Never commit secrets. New variables go in `.env.example` (app root or `backend/`) with an empty value and a comment.
- Customer PII (names, phone numbers, message bodies, emails) never goes to logs. Use the backend logger (it redacts), and don't `console.log` request bodies.
- Verify every inbound webhook signature on the raw body before parsing (Meta `X-Hub-Signature-256`, Clerk/Svix). Reject with 401. Dedupe via `webhook_events`.
- Meta access tokens are stored encrypted (`encryptSecret`) and are never returned by any endpoint.
- New tables get RLS enabled plus a business-scoped SELECT policy for `authenticated` and no write policies. Secret columns get column-level grants.
- SQL functions: `security definer` only when needed, always `set search_path = ''` with fully qualified names, and EXECUTE revoked from `public`/`anon`/`authenticated` unless intended.
- Validate every external input with zod (API bodies/queries, webhook payloads, Flow data). Normalise phones to E.164.
- Owner-only operations use `requireOwner`. Don't rely on the app hiding buttons.
- Stripe (when added): server-side only, webhook signatures verified, amounts computed on the server, never trusted from the client.
