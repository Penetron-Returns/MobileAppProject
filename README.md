# Clovie free edition: WhatsApp-first booking for small businesses

Customers book, reschedule and cancel appointments **inside WhatsApp** through structured menus, lists and forms. There is no app to install, no account and no AI guessing. Owners and staff run the business from an **Expo mobile app**: calendar, bookings, clients, services, staff hours, reports and a WhatsApp inbox.

This is the **free edition**, built for the ITMDA3 group S14 research project. It has **no AI and nothing paid**: no chat companion, no voice, no stories, no Stripe checkout, no plans and no usage limits. Every feature in the app is available to every business. The system answers the project's research question: does a structured WhatsApp booking flow beat conventional web booking on completion time, task success and usability? A web booking page on the same engine is the comparator, and both channels record step counts and timings.

---

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Run the free edition](#run-the-free-edition)
- [Running the checks](#running-the-checks)
- [Deploying](#deploying)
- [Contributing](#contributing)
- [Documentation](#documentation)

---

## Features

- **Calendar** (day, week, month) with live availability, walk-in and phone bookings, reschedule, cancel, check-in and attendance checks ("did the client come?").
- **Clients** with search, notes and booking history.
- **Settings:** business details, operating hours, services, staff and team (invited by email through Clerk), booking rules, notifications and the WhatsApp channel (status, pause and resume, reminder times).
- **Reports:** monthly revenue, completed jobs, bookings by source (WhatsApp, manual, web), no-shows, cancellations and busiest time. Plain numbers from your own data.
- **Inbox:** conversations and escalations from the WhatsApp menu flow, with staff reply and hand-back to the bot.
- **WhatsApp booking:** a deterministic menu flow (Book, My bookings, Talk to us) with lists, date and time pickers, a summary and a confirmation. Confirmations and reminders persist in the chat.
- **Web booking page** `/book/[slug]` on the same engine, as the research comparator.
- **Onboarding** in three steps: welcome, business type, business name. The app opens right after.
- Push notifications, Clerk sign-in with organisations (owner and staff roles), and a redesigned UI (`packages/ui`).

## How it works

```
Customer ──WhatsApp──▶ Meta Cloud API ──signed webhook──▶ Edge Function "api" (Hono)
                                                           │  deterministic conversation engine
Owner/staff ──Expo app──▶ Clerk (sign-in, orgs) ────────▶  │  booking service → database functions
      │                                                     ▼
      └──── reads + Realtime (row-level security) ─▶ Supabase Postgres (single source of truth)
Web comparator /book/[slug] ──▶ api /public/** ─────────────┘
pg_cron ──▶ api /cron/* (reminders, attendance, conversation expiry, number health, token refresh, cleanup)
```

- **Deterministic, no AI:** every WhatsApp input maps to a defined state and transition. Free text is never interpreted, and 3 invalid replies hand the chat to staff.
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
| Customer channel | Meta WhatsApp Cloud API · WhatsApp Flows · message templates (optional, see below) |
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
  api/                    API shell (Hono, own package.json, Vitest)
    src/routes/           /v1 (app), /public (web comparator), webhooks, cron
    src/middleware/       auth, idempotency, request context
    src/container.ts      composition root (wires ports to implementations)
    test/                 API tests (fakes from packages/testing)
packages/
  features/               booking domain: bookings, availability, catalog, clients, team, onboarding,
                          attendance, reports, repositories (runtime-neutral TypeScript)
  app-store/whatsapp/     deterministic WhatsApp booking: Graph client, engine, Flows, webhook, notifications
  testing/                in-memory fakes that honour the real port contracts
  types/                  API DTOs shared by app and API (@booking/types, types only)
  ui/                     @booking/ui design system
  config/                 shared presets (@booking/config): prettier, API tsconfig, eslint base
  database/               Supabase project (@booking/database)
    database.types.ts     generated Database types (scripts/db/gen-types.sh)
    supabase/             the folder the Supabase CLI expects under --workdir
      functions/api/      Edge Function entry (serves apps/api/src under /api)
      migrations/ tests/  schema, row-level security, database functions, SQL tests
      seed.sql            demo business "Ashgrove Hair & Beauty"
docs/                     build plan and design notes
scripts/                  database test harness, env helpers, AI-config sync
.claude/                  AI-assistant rules, agents, skills, hooks (developer tooling; see .claude/CLAUDE.md)
```

## Run the free edition

This walks through running the app on an Android emulator. The API and database can be your team's shared dev project (then you only need the app) or run locally.

### Prerequisites

- **Node.js 22** and npm 10+
- **JDK 17 or 21** (for the Android build) and the **Android SDK** with an **emulator** (Android Studio is the easy way; create a Pixel image with Google APIs)
- **Supabase CLI** and **Docker**, only if you run the API and database locally
- A **Clerk** development instance with **Organizations enabled**, trusted by Supabase as a third-party auth provider (see below)
- A Meta app with a WhatsApp test number, **optional**: only needed to try the WhatsApp flow. The app, calendar, reports and web booking work without it

Clerk's native sign-in does not run in Expo Go, so the app is run as a development build.

### 1. Install

```bash
git clone https://github.com/Penetron-Returns/MobileAppProject.git
cd MobileAppProject
npm install                      # workspaces: apps/mobile, packages/ui, packages/types, ...
npm --prefix apps/api install    # apps/api has its own install
# or both at once: npm run setup
```

### 2. Clerk and Supabase

1. In the Clerk dashboard create a development application, enable **Organizations** (membership mode Optional; `org:admin` is the owner, `org:member` is staff) and enable the **Supabase** integration so tokens carry the `authenticated` role.
2. In Supabase, add Clerk as a **third-party auth** provider using your Clerk domain. For a local Supabase run, `export CLERK_DOMAIN=<your-app>.clerk.accounts.dev` before `supabase start`.
3. Follow [docs/clerk-setup.md](docs/clerk-setup.md) for the rest (webhook, JWT key, native application registration for Android).

### 3. Database and API

Skip this step if your team already runs a shared dev project and you were given its URLs.

```bash
supabase --workdir packages/database start        # local Postgres, Auth, Realtime, Storage (needs Docker)
supabase --workdir packages/database db reset     # applies the migrations and seed.sql

cp apps/api/.env.example apps/api/.env            # then fill it in, see below
cd apps/api && npm run serve                      # supabase functions serve api, needs Supabase CLI + Docker
```

The API runs at `http://127.0.0.1:54321/functions/v1/api`. `apps/api/.env` needs:

- **Supabase:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (printed by `supabase status`). Never put the service-role key in the app.
- **Clerk:** `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `CLERK_AUTHORIZED_PARTIES`, `CLERK_WEBHOOK_SECRET`.
- **Secrets:** `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`), `FLOW_TOKEN_SECRET` and `CRON_SECRET` (random strings), `API_BASE_URL`.
- **Meta (optional):** `META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, the Flow key pair (`node packages/app-store/whatsapp/scripts/generate-flow-keys.mjs`) and `WHATSAPP_REGISTRATION_PIN`. [docs/whatsapp.md](docs/whatsapp.md) covers webhooks, Flows and connecting a number.

Every variable is documented in `apps/api/.env.example` and in [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) §7. Never commit real values.

### 4. App environment

The app needs four public values (none of them are secrets). Copy the example file and fill it in:

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

| Variable                            | What                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`               | The API base URL, for example `http://127.0.0.1:54321/functions/v1/api` for a local run |
| `EXPO_PUBLIC_SUPABASE_URL`          | Your Supabase project URL (`http://127.0.0.1:54321` locally)                            |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`     | The Supabase anon key (never the service-role key)                                      |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | The Clerk publishable key (`pk_test_...`)                                               |

The example file may still list optional entries from the paid edition (companion, voice, checkout). They are ignored by this edition; only the four above are required.

### 5. Build the dev client and run on an emulator

Start an Android emulator (or plug in a device with USB debugging), then:

```bash
cd apps/mobile
npx expo prebuild --platform android --no-install    # generates apps/mobile/android (git-ignored)
cd android && ./gradlew assembleDebug                # builds the debug APK
# install it: adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Or do build, install and launch in one step with `npx expo run:android`.

Then start Metro and open the app on the emulator:

```bash
cd apps/mobile
npx expo start --dev-client --port 8081
```

Notes:

- **Custom Metro port:** if 8081 is taken, pass `--port <n>` and forward it to the emulator with `adb reverse tcp:<n> tcp:<n>`.
- **Reaching a local API or Supabase from the emulator:** `127.0.0.1` inside the emulator is the emulator itself. Run `adb reverse tcp:54321 tcp:54321` so `http://127.0.0.1:54321` works, or use `http://10.0.2.2:54321`.
- **Clerk native sign-in:** register the Android package name (`si.nerova.booking.dev`) and the SHA-256 of your debug keystore in the Clerk dashboard under Native applications (see [docs/clerk-setup.md](docs/clerk-setup.md)).
- Reload after changing `.env`: restart Metro with `npx expo start --dev-client --clear`.
- The web target (`npx expo start --web`, including `/book/[slug]`) needs no dev build.

On first sign-in a new owner goes through onboarding (welcome, business type, business name) and lands on the Calendar. This edition has no AI, plan or payment screens.

## Running the checks

Run the checks for every area you touched before opening a PR:

| Area                          | Command                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App                           | `cd apps/mobile && npm run lint && npx tsc --noEmit && npm run test:no-watch` (+ `npm run export:web` / `export:android` to catch bundling regressions) |
| API                           | `cd apps/api && npx tsc --noEmit && npx vitest run`                                                                                                     |
| Everything (app + API + Edge) | `npm run check` from the repo root                                                                                                                      |
| Edge runtime                  | `cd apps/api && npm run check:edge && npm run test:edge`                                                                                                |
| Database                      | `scripts/db/test.sh` (throwaway Postgres: migrations, seed, SQL tests, types check; needs PostgreSQL 15+ binaries)                                      |
| DB types                      | `scripts/db/gen-types.sh` after changing a migration, then commit `packages/database/database.types.ts`                                                 |

## Deploying

| Part     | How                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------- |
| Database | `supabase --workdir packages/database db push` (dev project first, then prod)                                             |
| API      | `supabase --workdir packages/database functions deploy api` · secrets via `supabase secrets set --env-file apps/api/.env` |
| Cron     | store `api_base_url` and `cron_secret` in Supabase Vault (see [docs/database.md](docs/database.md))                       |
| WhatsApp | point the Meta webhook at `https://<project-ref>.supabase.co/functions/v1/api/webhooks/whatsapp`                          |
| App      | EAS builds on the `development`, `preview` and `production` profiles (see [docs/environments.md](docs/environments.md))   |

Dev and prod use separate Supabase projects and Clerk instances. Dev uses a Meta test number.

Some unused database objects from the paid edition remain because the migrations were not changed; see "Free edition: leftovers" in [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md).

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
| [architecture.md](docs/architecture.md)             | Repository layout, package boundaries, where code goes                     |
| [v1-scope.md](docs/v1-scope.md)                     | What is in and out of the free edition                                     |
| [database.md](docs/database.md)                     | Migrations, row-level security, tests, Vault secrets, cron                 |
| [booking-core.md](docs/booking-core.md)             | Availability engine, booking service, web comparator                       |
| [whatsapp.md](docs/whatsapp.md)                     | Meta setup, webhooks, Flows, templates, state machine                      |
| [mobile-app.md](docs/mobile-app.md)                 | App stack, dev builds, routes                                              |
| [design-system.md](docs/design-system.md)           | `@booking/ui`: tokens, components, accessibility rules, gallery            |
| [environments.md](docs/environments.md)             | Local, dev and prod setup, secrets, EAS                                    |
| [clerk-setup.md](docs/clerk-setup.md)               | Clerk dashboard checklist                                                  |
| [mcp.md](docs/mcp.md) · [skills.md](docs/skills.md) | AI developer tooling: MCP servers and skills                               |
| [.claude/CLAUDE.md](.claude/CLAUDE.md)              | Project guide for AI assistants (spec summary, stack, rules)               |
