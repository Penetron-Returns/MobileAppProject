# Repository architecture

This is the layout of the free edition. The structure follows [cal.diy](https://github.com/calcom/cal.diy):

- **Apps** are thin deployables.
- **The domain** lives in packages.
- **Third-party integrations** are self-contained folders with a registry.

It differs from cal.diy in one place: the feature packages are runtime-neutral (see below).

## Tree

```
apps/
  mobile/                 Expo app. Screens, navigation, and per-feature UI in src/features/<x>/
  api/                    Thin Hono shell on Supabase Edge Functions: routes, middleware, container (DI wiring)
packages/
  features/               The domain. One folder per feature (bookings, availability, catalog, clients, team,
                          onboarding, attendance, reports). Each holds services/, lib/, ports.ts and a README.md.
                          repositories/ holds the booking-schema interfaces and their Supabase implementation
  app-store/              Optional integrations, one folder each, plus _registry.ts. Today: whatsapp/
    whatsapp/             The deterministic WhatsApp menu booking app: engine, Flows, webhook, notifications, Graph client
  database/               Supabase: migrations/, tests/ (SQL), seed.sql, functions/api (Edge entry), generated types
  types/                  API DTOs shared by the app and the API (types only, no runtime code)
  ui/                     @booking/ui design system: tokens, primitives, components, patterns
  testing/                Shared fakes: in-memory repositories, fake Clerk, fake Graph API
  config/                 eslint, tsconfig and prettier presets
docs/                     Internal engineering docs: BUILD_PLAN, scope, this file
.claude/                  AI-assistant rules, agents, skills, hooks (developer tooling only; the product has no AI)
```

## What goes where

| You are adding... | It goes in | Not in |
| --- | --- | --- |
| A business rule (booking, availability, team, attendance, reports) | `packages/features/<feature>` | `apps/api` route handlers |
| An HTTP route | `apps/api/src/routes`. It parses input, calls a feature service and shapes the response | |
| A screen or other UI | `apps/mobile/src/features/<feature>` (composed from `@booking/ui`) | `packages/features` |
| A reusable visual piece | `packages/ui` | feature folders |
| A wrapper around a third-party service (WhatsApp, a calendar) | `packages/app-store/<name>` | `features` |
| A table, RPC, RLS policy or SQL test | `packages/database` | |
| A type shared by the app and the API | `packages/types` | duplicated on both sides |

**App-store apps** are optional integrations.

- **Interfaces:** they implement small capability ports and never own core data.
- **Credentials:** stored encrypted.
- **Removal:** deleting an app is deleting its folder, its registry line and its route shell.

## Dependency rules

These are enforced in CI by dependency-cruiser ([.dependency-cruiser.cjs](../.dependency-cruiser.cjs), `npm run check:boundaries`). Change the rules and this section in the same PR.

```
apps/*        -> packages/*                 (apps never import other apps)
app-store     -> features (ports), types
features      -> types, database types      (never app-store or apps, never Hono)
ui            -> types                      (never features)
types         -> nothing                    (types only)
production code never imports packages/testing
mobile never imports server code
```

SOLID in practice:

- **Single responsibility:** routes handle HTTP, services hold the rules, repositories handle persistence.
- **Open/closed:** add an app-store app by adding a folder and one registry line, never by editing switches.
- **Liskov:** every port implementation, including the fakes in `packages/testing`, honours the same contract (error codes, ordering, idempotency).
- **Interface segregation:** use small capability ports, not one big integration interface.
- **Dependency inversion:** features depend on ports, and only `apps/api/src/container.ts` (and the app providers) wire concrete implementations.

## Where we differ from cal.diy, and why

**Runtime-neutral features.** cal.diy mixes server code and React components in one feature folder because everything runs on Node and the web. We run React Native (Metro), Deno (the API) and Postgres. So `packages/features` holds only runtime-neutral TypeScript, and React Native UI stays in `apps/mobile`. Otherwise Metro would bundle server code.

## Where things are

| What | Where |
| --- | --- |
| Routes, middleware, `env.ts`, `container.ts` (DI wiring), `getDb`, validation helpers | `apps/api/src/` |
| `AppError`, logger, time, phone, crypto, PEM, the `Db` type | `packages/features/lib/` |
| Ports (`BookingService`, `NotificationService`, `ClerkAdmin`, ...) | `packages/features/ports.ts` (barrel) and each feature's `ports.ts` |
| Booking service, attempts, cleanup job, mappers | `packages/features/bookings/` |
| Availability engine | `packages/features/availability/` |
| Business, services, staff, hours, `/me` | `packages/features/catalog/` |
| Client operations | `packages/features/clients/` |
| Team, Clerk sync, member sync, devices, `ClerkAdmin` client | `packages/features/team/` |
| Attendance check (planner, cron executor, answer use case, Supabase repository) | `packages/features/attendance/` |
| Onboarding | `packages/features/onboarding/` |
| Monthly report (reads the `month_report` RPC) | `packages/features/reports/` |
| Repository interfaces, Supabase implementation, row types | `packages/features/repositories/` |
| WhatsApp (engine, flows, webhook, notifications, Meta Graph client, jobs) | `packages/app-store/whatsapp/`; routes stay in `apps/api/src/routes/whatsapp` |
| Flow JSON, templates, key generation | `packages/app-store/whatsapp/{assets,scripts}` |
| App registry and manifest type | `packages/app-store/{_registry,types}.ts`, `whatsapp/_metadata.ts` |
| In-memory fakes (booking repository, Clerk, attendance, reports, schedule, WhatsApp) | `packages/testing/` |
| Migrations, SQL tests, seed, Edge entry stub, generated DB types | `packages/database/` |
| API DTOs | `packages/types/` |

## Decisions that still matter

- **Repositories:** the booking schema's interfaces (`repositories/types.ts`) and its Supabase implementation (`supabase.ts`) live in `packages/features/repositories`. They are one adapter over one schema that most services share, and `supabase-js` is runtime-neutral (only its `Db` type is imported; the client is created in `apps/api/src/lib/db.ts`). The WhatsApp tables keep their own repository in `app-store/whatsapp/supabaseRepo.ts`.
- **Logger, errors, time, crypto:** the logger (port and redacting implementation) and `AppError` live in `packages/features/lib` because every layer needs them and neither touches Hono. `apps/api` keeps only HTTP-specific helpers (`validation.ts`) and `getDb`.
- **Env and container:** packages never import `apps/api`. Each reads a small structural type (for example `WhatsAppEnv`, `WaContainer`, `BookingContainer`) that `Env` and `Container` satisfy.
- **Notifications:** the `NotificationService` implementation is WhatsApp-specific, so it lives in `app-store/whatsapp/notifications`; the port stays in `features`. `container.ts` wires it.
- **Generated database types** live in `packages/database/database.types.ts` (one copy; `scripts/db/gen-types.sh` writes it). Consumers import `@booking/database` (tsconfig `paths` in `apps/api` and `apps/mobile`, the `deno.json` import map for Deno). `@booking/types` holds only the API DTOs and does not re-export the database types.
- **Module resolution:** `apps/api/tsconfig.json` `paths`, `tsconfig.depcruise.json` and the Deno import map (`packages/database/supabase/functions/api/deno.json`) list the `@booking/*` packages. `npm run check:imports` fails on drift, including Deno npm pins versus `apps/api/package.json`. Vitest uses an alias plus a resolver that finds npm packages from `apps/api`.
- **`apps/api` is not an npm workspace member.** It keeps its own `package-lock.json` and install (`npm run setup` runs both installs). The Deno import map pins exact versions that must equal `apps/api/package.json`.
- **Workspace members:** `apps/mobile`, `packages/ui`, `packages/types`, `packages/database`, `packages/config`.
- **Tests** stay in `apps/api/test` (one Vitest root; the harnesses build the real app). They import fakes from `@booking/testing`.
- **Edge function bundling:** the entry stub `packages/database/supabase/functions/api/index.ts` imports `apps/api/src/app.ts` by relative path, and the `deno.json` import map resolves the `@booking/*` packages. `supabase --workdir packages/database <cmd>` reads `<workdir>/supabase/config.toml`, so the database package keeps a nested `supabase/` folder.
