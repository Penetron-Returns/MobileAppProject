# Repository architecture

Status: **target structure, agreed 14 Oct 2026.** Migration step 2 (the move) is done on `colin/restructure`: `apps/api`, `packages/database`, `packages/types` and `packages/config` exist. Steps 3 onwards have not started, so the "Mapping from today" table below still describes the extraction. The migration order is at the end.

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
2. **Move PR (paths only, no behaviour change): DONE.**
   - `apps/backend` → `apps/api`, `supabase` → `packages/database`, `packages/shared` → `packages/types`
   - add `packages/config`
   - update CLAUDE.md, AGENTS.md, BUILD_PLAN, `.claude/rules`, the agents and the scripts
   - all checks green
3. **Extraction PR:** move domain code to `packages/features`, the WhatsApp demo to `packages/app-store/whatsapp` (with the registry), and the fakes to `packages/testing`. Add the boundary lint rule.
4. **Companion:** move the connector into `packages/companion`. The Pip work (Phase 6.3) is built there from the start, and `example-apps/companion-connector` follows.
5. **Later:** `apps/docs` (the documentation site), extensions as they are built, and Turborepo for cached per-package tasks once there are enough packages to benefit.

### Decisions made in the move PR

- **Generated database types live in `packages/database/database.types.ts`** (one copy; `packages/shared` and the spike's duplicate in `packages/types` are gone). `scripts/db/gen-types.sh` writes it. Consumers import `@booking/database` (tsconfig `paths` in `apps/api` and `apps/mobile`, the `deno.json` import map for Deno). `@booking/types` holds only the API DTOs and does **not** re-export the database types, so it keeps the rule "types depends on nothing".
- **`apps/api` is not an npm workspace member.** It keeps its own `package-lock.json` and install (`npm run setup`). The Deno import map pins exact versions that must equal `apps/api/package.json`, `typescript ^7` and `vitest ^5` would otherwise be hoisted next to the Expo toolchain's TypeScript, and the CI `backend` job (a required check) installs it standalone. Revisit when Turborepo arrives (step 5).
- **Workspace members:** `apps/mobile`, `packages/ui`, `packages/types`, `packages/database`, `packages/config`. The api and mobile still resolve `@booking/types` and `@booking/database` through `paths` rather than `node_modules` (type-only imports, so Metro never resolves them).
- **`packages/config` holds only presets that were already in use:** the Prettier config (root `.prettierrc.json` points at it), the API `tsconfig.node.json` (`apps/api` extends it) and the ESLint base (`apps/mobile` imports it). `apps/mobile` and `packages/ui` keep extending `expo/tsconfig.base`. `packages/ui` still imports its ESLint config from `apps/mobile`; untangling that is a later cleanup.
- **CI job and check names are unchanged** (`Backend and Edge Function`) so branch protection keeps matching.
- **Hooks:** the migration guard also checks the pre-move path `supabase/migrations/<file>` on `origin/master` until this PR merges, otherwise already-merged migrations would look new.
- **Local state moves:** `apps/backend/.env` becomes `apps/api/.env` (gitignored, move it by hand) and `supabase link` state moves to `packages/database/supabase/.temp/` (re-link).

## Spike results (Deno / Supabase)

Run 14 Oct 2026 on branch `colin/restructure` (Deno 2.9.6, Supabase CLI 2.121.0, edge-runtime image `v1.77.4`). Nothing was deployed and the local stack was not touched.

### Decision

Use a **`deno.json` import map** in the function folder (`<database>/supabase/functions/api/deno.json`) that maps `@booking/<pkg>` to workspace folders by relative path. For `tsc` and Vitest, mirror the same mapping in `tsconfig.json` `paths`. The entry stub imports `apps/api` by relative path.

| Option | Verdict |
| --- | --- |
| Relative paths in the entry stub (`../../../../../apps/api/src/app.ts`) | **Use** for the stub only (works today with `../../../apps/backend/...`) |
| `deno.json` `imports` map (`@booking/types` to `../../../../../packages/types/api.ts`, plus a `@booking/types/` prefix) | **Use** for `@booking/*` and the npm pins. Verified in `deno check`, `deno test` and the edge-runtime bundler |
| `deno.json` `workspace` | Not chosen. Not verified with the Supabase bundler (the CLI and edge-runtime read the per-function `deno.json`). Not needed |
| npm specifiers / `nodeModulesDir` | Not chosen. Edge runtime has no `node_modules` for workspace packages, and the folder would have to be uploaded |

Today's proof (`supabase/functions/api/deno.json`):

```json
"imports": {
  "@booking/types": "../../../packages/types/api.ts",
  "@booking/types/": "../../../packages/types/"
}
```

`apps/backend/src/types.ts` now has `import type { MemberRole, UUID } from '@booking/types';`. `apps/backend/tsconfig.json` has `"paths": { "@booking/types": ["../../packages/types/api.ts"], "@booking/types/*": ["../../packages/types/*"] }`. `packages/types` has a `package.json` named `@booking/types` (types only); `packages/shared/api.ts` is a one-line re-export of it. `packages/shared/database.types.ts` is still a full copy because `scripts/db/gen-types.sh` writes it.

Without the import-map line, `npm run check:edge` fails with `TS2307 Import "@booking/types" not a dependency and not in import map` (negative control, seen before the change).

### Verified

- `cd apps/backend && npx tsc --noEmit`: clean. `npx vitest run`: 30 files, 815 tests passed.
- `npm run check:edge` (`deno check`): passes. `npm run test:edge`: 8 passed, 0 failed.
- **Bundle, as `functions deploy` does it:** `docker run public.ecr.aws/supabase/edge-runtime:v1.77.4 bundle --entrypoint supabase/functions/api/index.ts --output /out/api.eszip` with the repo root mounted (network on, so npm resolves). It produced a 45 MB eszip that contains `packages/types/api.ts`. Files outside `supabase/functions` bundle fine because the bundler follows the module graph from the entrypoint. The image reports: "Specifying import_map through flags is no longer supported. Please use deno.json instead." So the `deno.json` next to the entry is what counts.
- **Simulated target layout** (scratch copy: `apps/api`, `packages/types`, `packages/shared`, `packages/database/supabase/functions/api`). `deno check` and `deno test` (8 passed) pass, and the same bundle command succeeds (45 MB eszip), with only these edits:
  - the stub `index.ts` imports `../../../../../apps/api/src/app.ts` (5 levels up from `packages/database/supabase/functions/api`)
  - the `deno.json` entries become `../../../../../packages/types/...`
  - `smoke.test.ts` paths point at `apps/api`
  - `check:edge` and `test:edge` scripts in `apps/api/package.json` point at the new path
- **`--workdir`:** `supabase --workdir packages/database <cmd>` reads `<workdir>/supabase/config.toml` (confirmed: the CLI loaded and validated the copied `config.toml` and reported its Clerk setting). The flag is documented as "the directory containing your `supabase/` folder, used exactly as given".

### Consequences for the move

- **Folder shape.** `--workdir packages/database` requires a nested `supabase/` folder, so the database package is `packages/database/supabase/{config.toml,migrations,tests,seed.sql,functions/api}`. A flat `packages/database/{migrations,...}` will not work without a symlink. Put the package's own `package.json` and generated types beside the `supabase/` folder.
- **The entry stub stays** at `packages/database/supabase/functions/api/` with `deno.json`, `deno.lock` and the smoke test. Edge Function names come from folders under `<workdir>/supabase/functions/`.
- **`config.toml` paths** (`import_map`, `entrypoint`) stay relative to `supabase/`, so they do not change.
- **Every relative `../../../packages/shared/...` import in `apps/backend/src` (about 30 files) must change** to `@booking/types` (or a relative path to `packages/types`). Both `tsconfig.json` `paths` and the `deno.json` map need the entry.
- **Metro / mobile.** Mobile does not import `@booking/shared`: it uses a `tsconfig` path alias `@shared/*` to `../../packages/shared/*`, and `api.ts` has no runtime exports (all 25 importing files use types only, erased by Babel), so Metro never resolves it. The rename needs only the alias target change in `apps/mobile/tsconfig.json` (or `@booking/types` as a path or workspace link). `@booking/ui` already works as a workspace package with `watchFolders`. Add `packages/types` to `watchFolders` only if a runtime export is ever added.

### Only documented or not run

- **`supabase functions serve` and a real hosted deploy were not run.** The local edge-runtime container was not up and the instruction was not to disturb the stack. The evidence is the same edge-runtime image bundling the entry. `serve` mounts the repo root differently from my `-v` mount, so confirm it once during the move PR: `supabase functions serve api --workdir packages/database`.
- **Hosted bundling with `--use-api`** (server-side, no Docker) uploads only the files the CLI finds by following imports. Not run. If a deploy complains about missing files, use `static_files` in `config.toml` for non-imported assets (the Flow JSON is imported with `with { type: 'json' }`, so it is in the graph).
- **Metro was not started.** The claim rests on type-only imports and the existing `@booking/ui` workspace setup.
- **Root `workspaces` entries** (`packages/types`, ...) were not added. That needs `npm install`, which would write into the shared `node_modules` used by other worktrees.

### Risks for the full move

1. The `deno.json` and `tsconfig` mappings drift apart. Keep one script that checks they list the same `@booking/*` names.
2. `scripts/db/*`, the Husky/CI paths, `.claude/hooks` (protects `supabase/migrations` and `packages/shared/database.types.ts`) and `scripts/env/*` all hardcode `supabase/` and `apps/backend`. Grep for them in the move PR.
3. `apps/backend/package.json` has its own `package-lock.json` and is not a root workspace today. The Deno pins in `deno.json` must stay in sync with it by hand.
4. Moving `apps/backend/whatsapp/*.json` changes the `../../whatsapp/...` imports in `assets.ts`. The edge bundle needs them in the module graph.
5. Extraction (step 3) adds `@booking/features` the same way: one more `deno.json` entry plus one `paths` entry per package, relative to the new function folder.
