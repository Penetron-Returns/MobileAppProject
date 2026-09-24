---
paths: backend/src/whatsapp/graph*.ts,backend/src/whatsapp/onboarding*.ts,backend/src/routes/clerk.ts,backend/src/**/stripe/**,backend/src/**/*client*.ts
description: Rules for clients of Meta Graph API, Clerk, Stripe and other external services
---

# External Integrations

External services (Meta Graph API, Clerk, Expo push, Stripe) are wrapped in small clients so the rest of the code depends on typed methods, not raw HTTP.

## Implementation

1. Wrap each service in one client module with an injectable `fetch` for tests and typed methods per operation.
2. Retry only transient failures (429, 5xx, documented throttling codes) with exponential backoff and jitter. Never retry 4xx.
3. Map provider errors to typed errors with the provider code preserved (e.g. Meta 190 → token invalid → account `needs_reauth`).
4. Verify inbound webhooks (signature on the raw body), dedupe via `webhook_events`, and return 2xx quickly for authentic duplicates.
5. Make onboarding steps idempotent and resumable, and record `last_error` on failure.
6. Pin the provider API version in env (`META_GRAPH_VERSION`), never inline.
7. Use the WhatsApp, Clerk and Stripe skills for provider specifics.

## Examples

```typescript
// ✅ DO
const graph = createGraphClient({ version: env.META_GRAPH_VERSION, fetch: deps.fetch });
await graph.sendMessage(phoneNumberId, token, message);

// ❌ DON'T
await fetch(`https://graph.facebook.com/v19.0/${id}/messages`, { … });
```
