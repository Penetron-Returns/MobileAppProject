# Booking platform: project guide

Deterministic, WhatsApp-first appointment booking for small service businesses (salons, barbers,
repair shops, wellness practices). Built by ITMDA3 group S14.

**Full contract:** `docs/BUILD_PLAN.md` (schema, RPCs, API, conversation engine, ownership) is binding.
Change it in the same PR as any contract change. Per-area design notes are in `docs/*.md`.

---

## 1. Product spec (condensed from the ITMDA3 Deliverable 3 spec)

**Problem.** Micro-businesses lose customers when booking forces app installs (40–60% onboarding
drop-off) or web redirects, while manual chat booking causes double-bookings, admin overhead and
no-shows. Research mostly covers AI chatbots, which are unpredictable and slow for scheduling.

**Solution.** Structured, form-based (non-AI) booking inside the WhatsApp thread the customer
already uses: menus, lists, date pickers, time-slot pickers and a confirmation, backed by one
authoritative schedule.

**Research question.** Does a structured WhatsApp booking flow beat conventional web booking on
completion time, task success and usability? A **web booking page** on the same engine and data is
the controlled comparator, and both channels record step counts and completion times.

### Users

- **Customer:** mobile-first, data-conscious, mixed digital literacy. Books, reschedules or
  cancels in WhatsApp with no app, no account and no redirect. Gets a confirmation that persists in
  chat, plus reminders.
- **Owner / staff:** no IT support and little time. Configures services, hours, staff capacity and
  rules. Sees one live day/week view, adds walk-in and phone bookings by hand, handles escalations.

### Functional requirements (FR)

1. Structured WhatsApp flow on first contact, not free-text chat
2. Show the current service catalogue
3. Duration derived from the selected service
4. Show only genuinely available dates and slots, live
5. Structured pickers for date and slot
6. Collect minimal intake details
7. Summary before confirming
8. Re-validate against availability at confirmation
9. Atomic write to the schedule
10. Confirmation that persists in chat history
11. Reschedule via a structured flow
12. Cancel via a structured flow
13. Automated reminders before the appointment
14. Owner creates, edits and deletes services
15. Owner sets operating days and hours
16. Owner sets staff/resource availability and capacity
17. Owner sets booking rules (lead time, cancellation window, buffer, …)
18. Rules enforced centrally, so no conflicts are possible
19. Single current day/week schedule view
20. Staff can enter manual (walk-in/phone) bookings
21. Record step count and completion time for every booking attempt (research)

### Non-functional requirements (NFR)

Deterministic, predictable outcomes · no install or login for customers · minimal data per step ·
responses within a time threshold · usable without instructions · faster than web booking ·
consistent schedule across channels · defined uptime target · maintainable by a non-technical
owner · handles concurrency without lag · intake data encrypted in transit and at rest · configurable
per business type · timestamped audit log of actions.

### Out of scope

Generative AI, NLU or voice · enterprise logistics, inventory, dynamic pricing · in-flow payments,
loyalty, marketing (possible later extensions; Stripe is planned as the first).

### App screens (from the mockups)

Sign-in (Clerk UI) · Dashboard (monthly revenue, today's bookings by status, next appointment +
check-in, today's schedule) · Calendar (day/week/month) · Booking detail (message, reschedule,
cancel) · Add booking (existing/new client, service, date, live slot, staff, notes, WhatsApp
confirmation) · Clients list (search, All/Recent/VIP) · Client profile (contact, notes, history) ·
Settings (business details, operating hours, services, staff, WhatsApp integration) · Inbox
(conversations, escalations) · Public web booking `/book/[slug]` (comparator).
Tabs: **Dashboard · Calendar · Add · Clients · Settings.**

---

## 2. Tech stack

| Layer          | Technology                                                                                                                                                                      | Notes                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Mobile/web app | Expo SDK 57 (dev builds), React 19, React Native 0.86 (New Architecture), Expo Router, TypeScript                                                                               | `apps/mobile/src/`. Exact versions in `package.json`                                                              |
| UI             | NativeWind + react-native-reusables (shadcn for RN), lucide icons                                                                                                               | design system `packages/ui` (`@booking/ui`), CSS variables in `apps/mobile/global.css`                            |
| App data       | TanStack Query, Supabase JS (reads + Realtime), `apps/mobile/src/lib/api.ts` (writes)                                                                                           |                                                                                                                   |
| Auth           | Clerk (`@clerk/expo`), custom sign-in UI on Clerk's headless hooks (`useSignIn`/`useSignUp`/`useSSO`; prebuilt `AuthView` no longer used). Orgs = businesses, roles owner/staff | JWT trusted by Supabase (third-party auth) and the API                                                            |
| API            | Hono on Supabase Edge Functions (Deno), one function `api`, TypeScript, zod v4, luxon                                                                                           | source in `apps/api/`, entry in `packages/database/supabase/functions/api/`, tests with Vitest + Deno smoke tests |
| Database       | Supabase Postgres + RLS, Realtime, Storage, pg_cron + pg_net                                                                                                                    | `packages/database/supabase/` migrations, seed, SQL tests                                                         |
| Channel        | Meta WhatsApp Cloud API, WhatsApp Flows (encrypted), message templates                                                                                                          | `apps/api/src/whatsapp/`                                                                                          |
| Payments       | Stripe (planned)                                                                                                                                                                | server-side only                                                                                                  |
| Builds         | EAS (development / preview / production channels), `supabase --workdir packages/database functions deploy api`                                                                  |                                                                                                                   |
| Tooling        | ESLint, Prettier, Husky, Jest (app), Vitest (api), GitHub Actions                                                                                                               |                                                                                                                   |

**Environments:** separate dev/prod Supabase projects (DB + Edge Functions) and Clerk instances, a Meta
test number, and EAS preview vs production.

---

## 3. How the system works

```
Customer ──WhatsApp──▶ Meta Cloud API ──signed webhook──▶ Edge Function api (Hono)
                                                           │  deterministic state machine
Owner/staff ──Expo app──▶ Clerk (JWT) ──────────────────▶  │  booking service → RPCs
      │                                                     ▼
      └──── reads + Realtime (RLS) ──────────────▶ Supabase Postgres (single source of truth)
Web comparator /book/[slug] ──▶ backend /public/** ─────────┘
pg_cron ──pg_net──▶ backend /cron/* (reminders, window expiry, WABA health, token refresh, cleanup)
```

- **Booking integrity:** `create_appointment` RPC plus the exclusion constraint on
  `(staff_id, blocked)` makes double booking impossible. Every mutation carries an `Idempotency-Key`.
- **Conversation engine:** pure `transition(state, input) → (state, actions)`, structured reply IDs,
  3-strike escalation to staff, 24h service window (templates outside it).
- **Audit:** `appointment_events` (lifecycle) + `audit_log` (config changes) + `webhook_events` (replay).
- **Research:** `booking_attempts` stores steps and timings for both channels.

---

## 4. Repository map

| Path                                                                   | What                                                                                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/src/app/`                                                 | Expo Router routes (thin)                                                                                           |
| `apps/mobile/src/features/<feature>/`                                  | hooks, components, pure logic per feature                                                                           |
| `packages/ui/` (`@booking/ui`), `apps/mobile/src/components/`          | design system (tokens, primitives, components, patterns) / app-only pieces                                          |
| `apps/mobile/src/lib/`                                                 | Supabase, API client, query client, env, formatters                                                                 |
| `apps/api/src/{routes,booking,whatsapp,notifications,middleware,lib}`  | API layers                                                                                                          |
| `apps/api/src/ports.ts`, `container.ts`                                | module contracts, composition root                                                                                  |
| `apps/api/whatsapp/`                                                   | Flow JSON, template definitions, key generation                                                                     |
| `packages/database/supabase/{migrations,tests,seed.sql,functions/api}` | schema, SQL tests, demo data, Edge Function entry stub                                                              |
| `packages/database/` (`@booking/database`)                             | Supabase project; generated `database.types.ts` lives beside `supabase/`                                            |
| `packages/types/` (`@booking/types`)                                   | types-only API contracts (`api.ts`)                                                                                 |
| `packages/config/` (`@booking/config`)                                 | shared presets: Prettier, API tsconfig, ESLint base                                                                 |
| `docs/`                                                                | `BUILD_PLAN`, `database`, `booking-core`, `whatsapp`, `mobile-app`, `design-system`, `clerk-setup`, `mcp`, `skills` |
| `.claude/rules/`, `.claude/skills/`, `.mcp.json`                       | AI tooling: rules, skills, MCP servers                                                                              |

---

## 5. Commands (run the ones for every area you touched before calling work done)

| Area                   | Check                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| App                    | `cd apps/mobile && npm run lint && npx tsc --noEmit && npm run test:no-watch`                                             |
| API                    | `cd apps/api && npx tsc --noEmit && npx vitest run`                                                                       |
| All (app + API + Edge) | `npm run check` from the repo root                                                                                        |
| Database               | `scripts/db/test.sh` (throwaway Postgres 16 → migrations → seed → SQL tests → types check)                                |
| DB types               | `scripts/db/gen-types.sh` after any migration change                                                                      |
| Edge                   | `cd apps/api && npm run check:edge && npm run test:edge` (Deno typecheck + smoke tests)                                   |
| Dev                    | `cd apps/mobile && npx expo start --dev-client` (app) · `cd apps/api && npm run serve` (API; needs Supabase CLI + Docker) |

---

## 6. Behavioral guidelines

1. **Think before coding.** State assumptions. If a requirement is ambiguous, check `docs/BUILD_PLAN.md`,
   then ask. Don't pick an interpretation silently.
2. **Read before you write.** Read the file's exports, its callers and nearby utilities before changing it.
   Search for the existing pattern and follow it.
3. **Source of truth.** Verify paths, table and column names, RPCs and routes against the code
   (`packages/database/database.types.ts`, `packages/types/api.ts`), never from memory.
4. **Checkpoint.** In multi-step work, summarise what's done, what's verified and what's left.
5. **Fail loud.** "Done" means the checks in §5 passed. Report anything skipped or unverified.
6. **Commits.** Never commit, push or open a PR unless asked. Never push to `master`
   (PRs need approval from @xd-Park3rr or @JpegAndre).

## 7. AI configuration

| Path                                                       | Purpose                                                                                            |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `.claude/rules/general/`                                   | always-on: SOLID principles, architecture, security, testing, git workflow                         |
| `.claude/rules/frontend/` · `backend/` · `infrastructure/` | load when matching files are touched                                                               |
| `.claude/rules/ai-rules/`                                  | conventions for rules, agents, skills and hooks                                                    |
| `.claude/agents/`                                          | `frontend`, `backend`, `frontend-reviewer`, `backend-reviewer`                                     |
| `.claude/skills/`                                          | vetted third-party + project skills (`docs/skills.md`)                                             |
| `.claude/hooks/` + `settings.json`                         | block pushes to master, force-push, `--no-verify`, edits to merged migrations/generated types/.env |
| `.mcp.json`                                                | Meta dev tools, Clerk, shadcn, Stripe, Supabase (`docs/mcp.md`)                                    |
| `AGENTS.md`                                                | mirror of this file for other AI tools (`node scripts/sync-ai-rules.mjs`)                          |
