# Repository architecture

Status: **target structure, agreed 14 Oct 2026.** Nothing has moved yet. The migration order is at the end.

The layout follows [cal.diy](https://github.com/calcom/cal.diy):
- **Apps** are thin deployables.
- **The domain** lives in packages.
- **Third-party integrations** are self-contained folders with a registry.
- **The parts outsiders study** have their own package.

It differs from cal.diy in three places, explained below:
- a separate `extensions` package
- a dedicated `companion` package
- runtime-neutral feature packages

## Target tree

```
apps/
  mobile/                 Expo app. Screens, navigation, and per-feature UI in src/features/<x>/
  api/                    Thin Hono shell on Supabase Edge Functions: routes, middleware, container (DI wiring)
  docs/                   Later: the public documentation site. Content is pulled from packages where possible
packages/
  features/               The domain. One folder per feature (bookings, availability, clients, team,
                          onboarding, plans, …). Each holds services/, repositories/, lib/, ports.ts,
                          types.ts and a README.md
  companion/              The AI layer the paid plans depend on. It is the part other platforms study
    connector/            Booking connector (MCP): the reference implementation of the contract
    session/              Companion (Pip) sessions for the app
    events/               Events sent to the AI provider
    README.md             How the connector works, with the contract version and conformance tests
  extensions/             First-party add-ons we build and sell: loyalty/, memberships/, deposits/, intake-forms/
  app-store/              Optional third-party apps, one folder each, plus _registry.ts
    <app>/                _metadata.ts, zod.ts (config schema), lib/, api/, tests/, DESCRIPTION.md
  database/               Supabase: migrations/, tests/ (SQL), seed.sql, generated database types
  types/                  API DTOs shared by the app and the API (types only, no runtime code)
  ui/                     @booking/ui design system: tokens, primitives, components, patterns
  testing/                Shared fakes: in-memory repositories, fake Clerk, fake Graph API, fake AI provider
  config/                 eslint, tsconfig and prettier presets
example-apps/
  companion-connector/    A minimal standalone connector other platforms can copy
docs/                     Internal engineering docs: BUILD_PLAN, scope, plans, this file
.claude/                  AI rules, agents, skills, hooks
```

## What goes where

| You are adding… | It goes in | Not in |
| --- | --- | --- |
| A business rule (booking, availability, team, plans) | `packages/features/<feature>` | `apps/api` route handlers |
| An HTTP route | `apps/api/src/routes`. It parses input, calls a feature service and shapes the response | |
| A screen or other UI | `apps/mobile/src/features/<feature>` (composed from `@booking/ui`) | `packages/features` |
| A reusable visual piece | `packages/ui` | feature folders |
| Anything about the AI companion | `packages/companion` | `features`, `app-store` |
| A first-party add-on with its own data (loyalty, memberships) | `packages/extensions/<name>` | `features` |
| A wrapper around a third-party service (Google Calendar, a payment provider, the WhatsApp demo) | `packages/app-store/<name>` | `features` |
| A table, RPC, RLS policy or SQL test | `packages/database` (an extension's tables are still a migration here, named after it) | |
| A type shared by the app and the API | `packages/types` | duplicated on both sides |

### The three kinds of add-on

- **Companion** is a product dependency, not a plugin.
  - **Wiring:** `features` defines the port (for example `AiCompanion`), and `apps/api/container.ts` always wires the companion implementation.
  - **Gating:** plans gate on the plan, never on whether something is "installed".
  - **Imports:** it depends only on `features` ports and `types`, so it can be read and understood on its own.
  - **Naming:** it is named for its role, not the vendor. Nerova powers it today.
- **Extensions** are features we build and may sell. They can own tables (through migrations in `packages/database`), use feature services through ports, and be bundled into plans. Settings → Extensions lists them.
- **App-store apps** are optional third-party integrations, installed per business.
  - **Interfaces:** they implement small capability ports (`CalendarSync`, `PaymentProvider`, `MessagingChannel`) and never own core data.
  - **Credentials:** stored encrypted.
  - **Listing:** Settings → Connected apps lists them.
  - **Removal:** deleting an app is deleting its folder and its registry line.

### Billing has two meanings

- **How salons pay us** (subscriptions) is core: `packages/features/billing`.
- **A salon taking payments from its clients** (checkout, deposits) is an app-store app, for example `app-store/stripe-checkout`.

## Dependency rules

These are enforced by a boundary lint rule in CI (dependency-cruiser or eslint-plugin-boundaries) once the move lands.

```
apps/*        → packages/*                 (apps never import other apps)
companion     → features (ports), types
extensions    → features (ports), types, database types
app-store     → features (ports), types
features      → types, database types      (never companion, extensions, app-store or apps)
ui            → types                      (never features)
types         → nothing                    (types only)
```

SOLID in practice:
- **Single responsibility:** routes handle HTTP, services hold the rules, repositories handle persistence.
- **Open/closed:** add an app-store app or an extension by adding a folder and one registry line, never by editing switches.
- **Liskov:** every port implementation, including the fakes in `packages/testing`, honours the same contract (error codes, ordering, idempotency).
- **Interface segregation:** use small capability ports, not one big integration interface.
- **Dependency inversion:** features depend on ports, and only `apps/api/container.ts` (and the app providers) wire concrete implementations.

## Where we differ from cal.diy, and why

1. **Runtime-neutral features.** cal.diy mixes server code and React components in one feature folder because everything runs on Node and the web. We run React Native (Metro), Deno (the API) and Postgres. So `packages/features` holds only runtime-neutral TypeScript, and React Native UI stays in `apps/mobile`. Otherwise Metro would bundle server code.
2. **`extensions` is separate from `features`.** cal.diy keeps its first-party add-ons inside `features`. Ours are sellable units with their own data, so they get their own package and their own listing in Settings.
3. **`companion` instead of `platform`.** cal.diy's `platform` is its outward-facing surface (atoms, curated libraries, examples). Our outward-facing surface is the companion connector, so the package is named after that role. The minimal public example lives in `example-apps/`, as cal.diy does.
4. **No app-store CLI yet.** The registry is hand-written until there are enough apps to justify a generator (YAGNI).

## Mapping from today

| Today | Target |
| --- | --- |
| `apps/backend/src/routes`, `middleware`, `container.ts`, `env.ts` | `apps/api/src/…` |
| `apps/backend/src/booking`, `plans`, `ports.ts`, repositories | `packages/features/<feature>/` |
| `apps/backend/src/nerova` | `packages/companion/connector` and `events` |
| `apps/backend/src/whatsapp`, `apps/backend/whatsapp` | `packages/app-store/whatsapp` (the Free demo, removed after launch) |
| `apps/backend/src/lib` (logger, crypto, Clerk admin) | `packages/features/lib` or `apps/api/src/lib`, whichever is the only consumer |
| `apps/backend/test/fakes` | `packages/testing` |
| `supabase/` | `packages/database/` (Supabase CLI with `--workdir`; the Edge Function entry stays a stub that imports `apps/api`) |
| `packages/shared` | `packages/types` |
| `packages/ui` | unchanged |

## Migration order

0. **Land the work in flight** (Team, Hours and Services screens), verify it on a device, and tell the team before the move so open branches can merge first.
1. **Spike:** prove that Deno resolves a workspace package (for example `@booking/types`) both in `supabase functions serve` and in a hosted deploy. This is the only technical unknown.
2. **Move PR (paths only, no behaviour change):**
   - `apps/backend` → `apps/api`, `supabase` → `packages/database`, `packages/shared` → `packages/types`
   - add `packages/config`
   - update CLAUDE.md, AGENTS.md, BUILD_PLAN, `.claude/rules`, the agents and the scripts
   - all checks green
3. **Extraction PR:** move domain code to `packages/features`, the WhatsApp demo to `packages/app-store/whatsapp` (with the registry), and the fakes to `packages/testing`. Add the boundary lint rule.
4. **Companion:** move the connector into `packages/companion`. The Pip work (Phase 6.3) is built there from the start, and `example-apps/companion-connector` follows.
5. **Later:** `apps/docs` (the documentation site), extensions as they are built, and Turborepo for cached per-package tasks once there are enough packages to benefit.
