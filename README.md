# Booking Admin: WhatsApp-first booking for small businesses

Customers book, reschedule and cancel appointments **inside WhatsApp** through structured menus, lists and forms. There's no app to install, no account and no AI guessing. Owners and staff run the business from an **Expo mobile app**: calendar, clients, services, staff hours and a WhatsApp inbox.

Built by ITMDA3 group S14. The system also answers the project's research question: does a structured WhatsApp booking flow beat conventional web booking on completion time, task success and usability? A web booking page on the same engine is the comparator, and both channels record step counts and timings.

---

## Contents

- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Running the checks](#running-the-checks)
- [Deploying](#deploying)
- [Contributing](#contributing)
- [Documentation](#documentation)

---

## How it works

```
Customer ──WhatsApp──▶ Meta Cloud API ──signed webhook──▶ Edge Function "api" (Hono)
                                                           │  deterministic conversation engine
Owner/staff ──Expo app──▶ Clerk (sign-in, orgs) ────────▶  │  booking service → database functions
      │                                                     ▼
      └──── reads + Realtime (row-level security) ─▶ Supabase Postgres (single source of truth)
Web comparator /book/[slug] ──▶ api /public/** ─────────────┘
pg_cron ──▶ api /cron/* (reminders, conversation expiry, number health, token refresh, cleanup)
```

- **Deterministic:** every WhatsApp input maps to a defined state and transition. Free text is never interpreted, and 3 invalid replies hand the chat to staff.
- **No double bookings:** a Postgres exclusion constraint on staff and time makes overlapping bookings impossible, whichever channel they come from.
- **Safe to retry:** every write carries an idempotency key, and webhook deliveries are de-duplicated.
- **Private by default:** businesses are isolated with row-level security, customer data never goes to logs, and Meta tokens are encrypted at rest.
- **The app reads, the API writes:** the app reads through Supabase and changes data only through the API, so booking rules live in one place.

## Tech stack

| Layer            | Technology                                                                         |
| ---------------- | ---------------------------------------------------------------------------------- |
| Mobile app       | Expo SDK 57 (dev builds) · React 19 · React Native 0.86 · Expo Router · TypeScript |
| UI               | NativeWind · react-native-reusables (shadcn for React Native) · lucide icons       |
| App data         | TanStack Query · Supabase JS (reads + Realtime)                                    |
| Auth             | Clerk, prebuilt UI only. Organisations are businesses, with owner and staff roles  |
| API              | Hono on Supabase Edge Functions (Deno) · zod · luxon                               |
| Database         | Supabase Postgres · row-level security · Realtime · Storage · pg_cron              |
| Customer channel | Meta WhatsApp Cloud API · WhatsApp Flows · message templates                       |
| Payments         | Stripe (planned)                                                                   |
| Tooling          | ESLint · Prettier · Husky · Jest (app) · Vitest + Deno (API) · GitHub Actions      |

Exact app versions are in `package.json` and [docs/mobile-app.md](docs/mobile-app.md).

## Repository layout

```
apps/
  mobile/                 Expo app (own package.json, Jest)
    src/app/              routes (Expo Router)
    src/features/         hooks, components and logic per feature
    src/components/       app-only pieces (shared UI lives in packages/ui)
    src/lib/              Supabase + API clients, env, formatters
  api/                    API source (Hono, own package.json, Vitest)
    src/booking/          availability engine + booking service
    src/whatsapp/         Graph API client, conversation engine, Flows, onboarding
    src/notifications/    confirmations, reminders, push
    src/routes/           /v1 (app), /public (web comparator), webhooks, cron
    whatsapp/             Flow JSON, message templates, Flows key generator
packages/
  types/                  API DTOs shared by app and API (@booking/types, types only)
  database/               Supabase project (@booking/database)
    database.types.ts     generated Database types (scripts/db/gen-types.sh)
    supabase/             the folder the Supabase CLI expects under --workdir
      functions/api/      Edge Function entry (serves apps/api/src under /api)
      migrations/ tests/  schema, row-level security, database functions, SQL tests
      seed.sql            demo business "Ashgrove Hair & Beauty"
  config/                 shared presets (@booking/config): prettier, API tsconfig, eslint base
  ui/                     @booking/ui design system
docs/                     build plan and design notes
scripts/                  database test harness, AI-config sync
.claude/                  AI rules, agents, skills, hooks (see .claude/CLAUDE.md)
```

## Getting started

### Prerequisites

- **Node.js 22+** and npm 10+
- **Supabase CLI** and **Docker** (to run the database and API locally)
- **PostgreSQL 15+ binaries** (only for `scripts/db/test.sh`)
- A **Clerk** application with Organizations enabled, and access to the team's **Meta** app with a WhatsApp test number
- **EAS CLI** (`npm i -g eas-cli`) for development builds. Clerk's native sign-in doesn't run in Expo Go

### 1. Install

```bash
git clone https://github.com/Penetron-Returns/MobileAppProject.git
cd MobileAppProject
npm run setup            # npm workspaces (apps/mobile + packages/ui + git tooling) and apps/api dependencies
```

### 2. Database

```bash
supabase --workdir packages/database start                    # local Postgres, Auth, Realtime, Storage
supabase --workdir packages/database db reset                 # applies packages/database/supabase/migrations and seed.sql
```

Set up Clerk as a third-party auth provider in Supabase. See [docs/database.md](docs/database.md) and [docs/clerk-setup.md](docs/clerk-setup.md).

### 3. API (Edge Function)

```bash
cp apps/api/.env.example apps/api/.env   # fill in Clerk, Meta and secret values
npm --prefix apps/api run serve    # supabase --workdir packages/database functions serve api
```

The API runs at `http://127.0.0.1:54321/functions/v1/api`. Generate the WhatsApp Flows key pair with `node apps/api/whatsapp/generate-flow-keys.mjs`. [docs/whatsapp.md](docs/whatsapp.md) covers webhooks, Flows and connecting a number.

### 4. App

```bash
cd apps/mobile
cp .env.example .env.local    # EXPO_PUBLIC_API_URL, EXPO_PUBLIC_SUPABASE_URL/_ANON_KEY, EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
npx expo run:android          # or run:ios: builds and installs a local dev build (Clerk's native UI needs one)
                              # no local toolchain? eas build --profile development --platform android
npx expo start --dev-client   # daily loop once the dev build is installed
npx expo start --web          # web target (incl. /book/[slug]) needs no dev build
```

Only `EXPO_PUBLIC_*` values go in the app, and none of them are secrets.

## Running the checks

Run the checks for every area you touched before opening a PR:

| Area                          | Command                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App                           | `cd apps/mobile && npm run lint && npx tsc --noEmit && npm run test:no-watch` (+ `npm run export:web` / `export:android` to catch bundling regressions) |
| API                           | `cd apps/api && npx tsc --noEmit && npx vitest run`                                                                                                     |
| Everything (app + API + Edge) | `npm run check` from the repo root                                                                                                                      |
| Edge runtime                  | `cd apps/api && npm run check:edge && npm run test:edge`                                                                                                |
| Database                      | `scripts/db/test.sh` (throwaway Postgres: migrations, seed, SQL tests, types check)                                                                     |
| DB types                      | `scripts/db/gen-types.sh` after changing a migration, then commit `packages/database/database.types.ts`                                                 |

## Deploying

| Part     | How                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------- |
| Database | `supabase --workdir packages/database db push` (dev project first, then prod)                                             |
| API      | `supabase --workdir packages/database functions deploy api` · secrets via `supabase secrets set --env-file apps/api/.env` |
| Cron     | store `api_base_url` and `cron_secret` in Supabase Vault (see [docs/database.md](docs/database.md))                       |
| WhatsApp | point the Meta webhook at `https://<project-ref>.supabase.co/functions/v1/api/webhooks/whatsapp`                          |
| App      | EAS builds and updates on the `preview` and `production` channels                                                         |

Dev and prod use separate Supabase projects and Clerk instances. Dev uses a Meta test number.

## Contributing

We work in branches on this repository. **Don't fork.** `master` only changes through reviewed pull requests.

1. Update master: `git switch master && git pull`.
2. Create a branch named `contributor-name/feature-name`: `git switch -c charl/login-page`.
3. Make your changes, run the checks, and commit: `git commit -m "Add login page"`.
4. Push the branch: `git push -u origin HEAD`.
5. Open a pull request into `master`. It needs CI to pass and approval from @xd-Park3rr or @JpegAndre.

Never push to `master` directly. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow. AI assistants follow the same rules through `.claude/` (rules, hooks and agents).

## Documentation

| Doc                                                 | Covers                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| [BUILD_PLAN.md](docs/BUILD_PLAN.md)                 | The binding contract: schema, database functions, API, conversation engine |
| [database.md](docs/database.md)                     | Migrations, row-level security, tests, Vault secrets, cron                 |
| [booking-core.md](docs/booking-core.md)             | Availability engine, booking service, web comparator                       |
| [whatsapp.md](docs/whatsapp.md)                     | Meta setup, webhooks, Flows, templates, state machine                      |
| [mobile-app.md](docs/mobile-app.md)                 | App stack, dev builds, routes                                              |
| [design-system.md](docs/design-system.md)           | `@booking/ui`: tokens, components, accessibility rules, gallery            |
| [clerk-setup.md](docs/clerk-setup.md)               | Clerk dashboard checklist                                                  |
| [mcp.md](docs/mcp.md) · [skills.md](docs/skills.md) | AI tooling: MCP servers and skills                                         |
| [.claude/CLAUDE.md](.claude/CLAUDE.md)              | Project guide for AI assistants (spec summary, stack, rules)               |
