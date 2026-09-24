---
description: Security and privacy requirements for secrets, PII, webhooks, RLS and input validation (always loaded)
---

# Security

Customer phone numbers, names and messages are personal data, and Meta tokens can send messages as the business. Treat both accordingly.

## Implementation

1. Never commit secrets. Add new variables to the relevant `.env.example` with an empty value and a comment.
2. Never log PII (names, phones, message bodies, emails) or tokens. Use the backend logger, which redacts. Never `console.log` request bodies.
3. Verify every inbound webhook signature on the raw body before parsing (Meta `X-Hub-Signature-256`, Clerk/Svix). Reject with 401 and dedupe via `webhook_events`.
4. Store Meta access tokens encrypted (`encryptSecret`) and never return them from any endpoint.
5. Give new tables RLS plus a business-scoped SELECT policy for `authenticated` and no write policies. Protect secret columns with column grants.
6. Write SQL functions with `set search_path = ''` and fully-qualified names. Use `security definer` only when needed, and grant EXECUTE deliberately.
7. Validate all external input with zod and normalise phone numbers to E.164.
8. Enforce owner-only operations server-side with `requireOwner`. Hiding a button is not authorisation.
9. Keep Stripe server-side: compute amounts on the server and verify webhook signatures.

## Examples

```typescript
// ✅ DO
logger.info('inbound_message', { business_id, wamid, from: maskPhone(from) });

// ❌ DON'T
console.log('got message', payload);
```
