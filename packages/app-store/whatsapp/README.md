# WhatsApp (Free demo)

The structured, non-AI booking menu inside the customer's WhatsApp thread: lists, date and time pickers, a
summary and a confirmation, backed by `BookingService`. It is the demo for the Free plan and is removed after
launch (paid plans use `@booking/companion`), so nothing outside this folder, its registry line and its route
shell may depend on it. Required plan feature: `whatsapp_menu` (see `_metadata.ts`).

| Path                                                                                                       | What                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `engine/`                                                                                                  | Pure conversation engine: `transition(state, input) -> (state, actions)`, copy, rendering, executor. No AI, no free text |
| `flows/`                                                                                                   | WhatsApp Flows endpoint: encryption, signed flow tokens, booking and reschedule screens                               |
| `webhook/`                                                                                                 | Inbound event extraction and processing, deduped through `webhook_events`                                             |
| `notifications/`                                                                                           | `NotificationService` implementation (customer messages, staff push)                                                  |
| `assets/`                                                                                                  | Flow JSON and template definitions, imported with `with { type: 'json' }` so the Deno bundle includes them           |
| `scripts/`                                                                                                 | `generate-flow-keys.mjs` for the Flows RSA key pair                                                                   |
| `deps.ts`, `graph.ts`, `repo.ts`, `supabaseRepo.ts`, `outbound.ts`, `inbox.ts`, `jobs.ts`, `onboarding.ts` | Dependency bundle, Meta Graph client, persistence, sending, inbox, cron jobs, connect flow                            |

`WhatsAppEnv` and `WaContainer` (in `deps.ts`) describe the slice of the API environment and container this app
reads. `apps/api`'s `Env` and `Container` satisfy them structurally, so this folder never imports `apps/api`.
Routes stay in `apps/api/src/routes/whatsapp` and only parse, authorise and call into here.

Design notes: [docs/whatsapp.md](../../../docs/whatsapp.md).
