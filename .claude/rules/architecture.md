# Architecture boundaries

These boundaries are load-bearing. Breaking one needs a `docs/BUILD_PLAN.md` change in the same PR.

- **App reads, API writes.** The Expo app reads through Supabase (RLS scopes rows to the caller's business) and writes only through the backend API. The app never holds the service-role key or Meta tokens.
- **One source of truth.** Postgres owns state. Availability is computed live, never cached. Double booking is prevented by the exclusion constraint. Don't re-implement that check elsewhere as a substitute.
- **Backend layering:** `routes/*` → services (`booking/`, `whatsapp/`, `notifications/`) → repositories → `db`. Arrows point one way only. Routes never query tables directly unless it's a trivial scoped read. Services never import Hono.
- **Cross-module calls go through ports** (`backend/src/ports.ts`). WhatsApp code books appointments only via `BookingService`, never by writing `appointments`.
- **`shared/` is types-only.** No runtime imports there, ever. Both app and backend depend on it. Change it additively and update both sides together.
- **The WhatsApp engine is deterministic.** No AI, no NLP, no free-text interpretation. Inputs are typed events with structured IDs, and anything unexpected gets a fixed re-prompt or escalation.
- **Every mutation is idempotent** (`Idempotency-Key` on API calls, deterministic keys for WhatsApp/web bookings) and audited (`appointment_events`, `audit_log`).
- **Every query is business-scoped.** Service-role code must filter by `business_id` explicitly. RLS is the last line of defence, not the first.
- **Time:** instants are ISO-8601 UTC. Calendar dates and wall-clock times are in the business timezone. Weekday 0 = Sunday. Money is integer cents.
