# Claude Code skills

This repo vendors a curated set of [Agent Skills](https://docs.claude.com/en/docs/claude-code/skills)
under `.claude/skills/`. **Claude Code auto-discovers every folder under `.claude/skills/`** for
anyone who opens this repository — no configuration or opt-in is required, and no MCP server or
plugin install is needed. A skill loads itself into context when its `SKILL.md` description matches
the task at hand.

All skills here were pulled from the **official vendor repositories** (or, for WhatsApp, the best
available community repos — see below), shallow-cloned at a pinned commit, and had every file
(`SKILL.md`, references, scripts) read before being vendored. Nothing here calls an unknown
endpoint, asks the agent to read `.env`/secret files on its own initiative, exfiltrates data, tries
to bypass permissions, or edits global config. Where a skill uses a **user-supplied** credential
(e.g. `CLERK_SECRET_KEY`, `WHATSAPP_TOKEN`) to call that vendor's own official API, that's the
intended, documented use of a credential the project already needs for that integration — not an
exfiltration path — and is noted per-skill below.

## Installed skills

| Skill (folder) | What it's for in this project | Source | Commit | License |
| --- | --- | --- | --- | --- |
| `ui-ux-pro-max` | General UI/UX design intelligence (accessibility, layout, color, typography, motion) with a local, offline search index; includes a `react-native` stack profile | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (`.claude/skills/ui-ux-pro-max`) | `dcc40ff` | MIT |
| `react-best-practices` | React/Next.js performance rules from Vercel Engineering — the parts that generalize to any React code (rendering, re-renders, async, bundling) | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) (`skills/react-best-practices`) | `063bee9` | MIT |
| `react-native-skills` | React Native/Expo performance rules — list virtualization, animation, native modules, monorepo pitfalls | vercel-labs/agent-skills (`skills/react-native-skills`) | `063bee9` | MIT |
| `composition-patterns` | React composition patterns (compound components, avoiding boolean-prop sprawl) for the `packages/ui` (`@booking/ui`) design system | vercel-labs/agent-skills (`skills/composition-patterns`) | `063bee9` | MIT |
| `web-design-guidelines` | Interface-quality review checklist (also useful for the `/book/[slug]` web comparator) | vercel-labs/agent-skills (`skills/web-design-guidelines`) | `063bee9` | MIT (repo-level) |
| `expo-overview` | Router/entry point for all Expo work; detects the real goal and routes to the right `expo-*`/`eas-*` skill | [expo/skills](https://github.com/expo/skills) (`plugins/expo/skills/expo-overview`) | `cd75214` | MIT |
| `expo-router` | File-based routing, stacks/tabs/modals, deep links for `apps/mobile/src/app/` | expo/skills (`plugins/expo/skills/expo-router`) | `cd75214` | MIT |
| `expo-project-structure` | Folder layout conventions for a new Expo Router app | expo/skills (`plugins/expo/skills/expo-project-structure`) | `cd75214` | MIT |
| `expo-dev-client` | Building/distributing dev clients for testing native code changes | expo/skills (`plugins/expo/skills/expo-dev-client`) | `cd75214` | MIT |
| `expo-data-fetching` | Fetch/React Query/SWR patterns, loading/empty/error states, offline support | expo/skills (`plugins/expo/skills/expo-data-fetching`) | `cd75214` | MIT |
| `expo-upgrade` | Upgrading Expo SDK versions and fixing dependency breakage | expo/skills (`plugins/expo/skills/expo-upgrade`) | `cd75214` | MIT |
| `expo-module` | Writing native modules/views with the Expo Modules API (Swift/Kotlin/TS) | expo/skills (`plugins/expo/skills/expo-module`) | `cd75214` | MIT |
| `eas-workflows` | EAS Workflows YAML for CI/CD (build → submit → update pipelines) | expo/skills (`plugins/expo/skills/eas-workflows`) | `cd75214` | MIT |
| `eas-update` | OTA JS/asset updates — channels, branches, runtime versions, debugging stale installs | expo/skills (`plugins/expo/skills/eas-update`) | `cd75214` | MIT |
| `eas-app-stores` | Building and submitting to TestFlight/App Store/Google Play with EAS | expo/skills (`plugins/expo/skills/eas-app-stores`) | `cd75214` | MIT |
| `supabase` | Supabase-wide guidance: CLI, MCP server, RLS/Data API security checklist, migrations vs. declarative schemas, debugging | [supabase/agent-skills](https://github.com/supabase/agent-skills) (`skills/supabase`) | `551274e` | MIT |
| `supabase-postgres-best-practices` | Postgres rules (indexing, RLS performance, locking, connection pooling) for `packages/database/supabase/migrations` | supabase/agent-skills (`skills/supabase-postgres-best-practices`) | `551274e` | MIT |
| `clerk` | Router skill — points to the right Clerk skill for the task at hand | [clerk/skills](https://github.com/clerk/skills) (`skills/core/clerk`) | `417e478` | MIT (per `SKILL.md`; repo has no root `LICENSE` file) |
| `clerk-setup` | Initial Clerk install/quickstart wiring | clerk/skills (`skills/core/clerk-setup`) | `417e478` | MIT |
| `clerk-backend-api` | Clerk Backend REST API explorer/executor (list/update users, orgs, invitations) for `apps/api/src/routes/clerk.ts` and admin scripts. Uses the project's own `CLERK_SECRET_KEY` against `api.clerk.com` only; requires explicit confirmation before any write/delete | clerk/skills (`skills/core/clerk-backend-api`) | `417e478` | MIT |
| `clerk-expo` | `@clerk/expo` setup, prebuilt/custom sign-in flows, protected Expo Router routes — the app's actual auth surface | clerk/skills (`skills/mobile/clerk-expo`) | `417e478` | MIT |
| `clerk-orgs` | Organizations = businesses, roles (owner/staff), member management — maps directly onto `businesses`/`users`/`member_role` | clerk/skills (`skills/features/clerk-orgs`) | `417e478` | MIT |
| `clerk-webhooks` | Verifying and handling the Clerk webhook (`apps/api/src/routes/clerk.ts`, org/user/membership mirror) | clerk/skills (`skills/features/clerk-webhooks`) | `417e478` | MIT |
| `stripe-best-practices` | Stripe integration guidance for when payments land: API selection, webhooks-are-required, key/security best practices, mobile/client-side key handling | [stripe/ai](https://github.com/stripe/ai) (`skills/stripe-best-practices`) | `a682cd5` | MIT |
| `hono` | Inline Hono API reference (routing, middleware, validation, testing) for the single `apps/api/api/index.ts` function | [honojs/skills](https://github.com/honojs/skills) (`skills/hono`) | `8b1938b` | MIT |
| `whatsapp-cloud-api` | Comprehensive Cloud API reference — all message types, webhooks, templates, media, interactive messages, Coexistence, error codes | [bellopushon/whatsapp-cloud-api](https://github.com/bellopushon/whatsapp-cloud-api) (`skills/whatsapp-cloud-api`) | `8cd0934` | MIT |
| `whatsapp-cloud-api-fieldguide` | Field notes on the *silent-failure* traps the reference above doesn't cover (missing `subscribed_apps`, webhook field subscriptions, Embedded Signup creating a second WABA, the 2026-10-01 pricing change) plus a bundled `diagnose.py` that checks a live setup against `graph.facebook.com` using the project's own `WHATSAPP_*` env vars | [guisa17/whatsapp-cloud-api-skill](https://github.com/guisa17/whatsapp-cloud-api-skill) (repo root) | `23b691d` | MIT |

**Total on disk:** ~5.6 MB across 28 skills (`du -sh .claude/skills`).

The two WhatsApp skills are complementary by design: `whatsapp-cloud-api` is the API surface
reference (what to send), `whatsapp-cloud-api-fieldguide` is the operational war-story guide (what
silently breaks and how to prove it's fixed). Both are read-only reference material except for the
field-guide's `references/diagnose.py`, which only talks to `https://graph.facebook.com` using
environment variables the project already sets for the WhatsApp integration.

## How to update a vendored skill

1. Re-clone the source repo at a newer commit into a scratch directory, e.g.:
   ```bash
   git clone --depth 1 https://github.com/<owner>/<repo>.git /tmp/skill-update/<repo>
   ```
2. Diff the specific skill folder against what's vendored here:
   ```bash
   diff -ru .claude/skills/<name> /tmp/skill-update/<repo>/<path-from-table-above>
   ```
3. Re-read every changed file (same bar as a new install — see "Security vetting" below) before
   copying it in. Pay special attention to new scripts, new `allowed-tools`, and new network calls.
4. Update this table's **Commit** column to the new short SHA.
5. If the skill's `name:` frontmatter collides with another vendored skill (as both WhatsApp skills'
   upstream `name: whatsapp-cloud-api` did), keep the renamed, disambiguated folder/`name` used here
   rather than reverting to the upstream name.

## Security vetting

Every file in every installed skill (`SKILL.md`, `references/`, `scripts/`) was read before
vendoring. Rejected or stripped on sight would have been: calls to unknown/non-vendor endpoints,
telemetry, `curl | sh`, instructions to ignore user/system instructions or bypass permissions, edits
to global config, or obfuscated code/binaries. None of the installed skills contain any of that.
Specific things checked and cleared:

- **`clerk-backend-api`** grants `allowed-tools: Bash, ...` and its `curl` templates call
  `api.clerk.com` with `$CLERK_SECRET_KEY` — this is the intended use of a credential the backend
  already holds, not exfiltration. It mandates a confirmation step before any write/delete and never
  sends data anywhere but Clerk's own API. Its bundled `scripts/*.sh` only fetch Clerk's own public
  OpenAPI spec from `raw.githubusercontent.com/clerk/openapi-specs` and parse it locally; a
  `scripts/execute-request.sh` exists but `SKILL.md` explicitly tells the agent not to use it.
- **`whatsapp-cloud-api-fieldguide`**'s `references/diagnose.py` only calls
  `https://graph.facebook.com` using `WHATSAPP_*` env vars the user sets themselves (see its
  `.env.example`); no other host, no telemetry.
- **`ui-ux-pro-max`**'s `scripts/` are local-only (search a bundled CSV/JSON index); no network
  calls. Its `SKILL.md` was patched to invoke `scripts/search.py` by a path relative to the repo
  root instead of the upstream `${CLAUDE_PLUGIN_ROOT}` variable, which only resolves for Claude Code
  *plugins* — this repo installs it as a plain project skill.
- **`hono`** only reaches `hono.dev` (official docs) and installs the official `@hono/cli`.
- Every `curl | bash` seen in `clerk-backend-api`'s docs (piping Clerk's own OpenAPI spec into a
  bundled local parser) was read end-to-end; the parser only reads its stdin as YAML text and prints
  Markdown — it does not `eval` or execute anything from the fetched content.
- Expo's own plugin ships an **opt-in, off-by-default** usage-telemetry hook (`expo-skill-feedback` +
  `plugins/expo/hooks/`). We did not vendor `expo-skill-feedback` or the `hooks/` directory, so no
  telemetry code shipped with this install at all.

## Rejected (and why)

| Source | Skill(s) | Reason |
| --- | --- | --- |
| nextlevelbuilder/ui-ux-pro-max-skill | `design`, `ui-styling`, `design-system`, `brand`, `banner-design`, `slides` | Marketing/web-canvas/logo/slide-deck tooling (CIP mockups, banner ads, HTML slide decks); `ui-styling` alone bundles ~5.8 MB of Google Font binaries for a web shadcn/canvas workflow that doesn't apply to NativeWind + react-native-reusables. |
| vercel-labs/agent-skills | `deploy-to-vercel` | Removed after review: when the Vercel CLI isn't authenticated, its fallback (`resources/deploy.sh`) uploads a tarball of the project to a public, claimable deployment at `claude-skills-deploy.vercel.com`. That would leak this private repo's code. Deploy `apps/api/` with the team's own Vercel account instead. |
| vercel-labs/agent-skills | `react-view-transitions` | Wraps the browser `document.startViewTransition` API — no equivalent in React Native. |
| vercel-labs/agent-skills | `vercel-optimize` | Cost/performance audit tool that needs live Vercel production metrics and its own investigation pipeline; there's no deployed traffic yet for `apps/api/` to audit. |
| vercel-labs/agent-skills | `vercel-cli-with-tokens` | Explicitly instructs the agent to `grep`/read `.env` files to locate a `VERCEL_TOKEN`. The underlying use (the project's own token, sent only to Vercel's CLI) is legitimate, but it matches this project's "don't vendor skills that read env files for secrets" rule, so it's rejected rather than special-cased. Deploy with the Vercel CLI logged in to the team account. |
| vercel-labs/agent-skills | `writing-guidelines` | Prose/tone reviewer, not code. |
| expo/skills | `expo-animation`, `expo-native-ui`, `expo-ui`, `expo-design-system`, `expo-examples`, `expo-dom`, `expo-app-clip`, `expo-brownfield`, `expo-web-to-native` | Lower priority for this app (no App Clips, no brownfield native integration, no DOM/webview components, no web-to-native conversion) or overlapping with the general UI guidance already covered by `ui-ux-pro-max`/`react-native-skills`/`composition-patterns`. Can be added later if the team starts polishing native visual details or fetching Expo example code. |
| expo/skills | `eas-hosting`, `eas-observe`, `eas-simulator`, `eas-update-insights` | The API runs on Supabase Edge Functions, not EAS Hosting; observability/simulator/update-analytics are monitoring add-ons, not needed to build the core app. |
| expo/skills | `expo-skill-feedback` | Feedback/telemetry meta-skill (opt-in, off by default, but still a telemetry surface). Left out entirely so no telemetry code ships in this repo's skill set. |
| expo-experiments plugin | `expo-migrate-module` | One-off migration helper (old Swift definition DSL → Modules API 2.0 macros); not applicable, nothing to migrate yet. |
| clerk/skills | `clerk-cli` | Heavy interactive terminal-management skill (impersonation, instance config, feature toggles) — more than this project's coding tasks need; revisit if the team wants Claude driving `clerk` CLI admin tasks directly. |
| clerk/skills | `clerk-custom-ui` | Web-focused custom auth UI/theming; superseded here by `clerk-expo`, which covers the app's actual (React Native) custom flows. |
| clerk/skills | `clerk-billing` | Clerk's own subscription/billing UI. The project uses Stripe directly for payments, not Clerk Billing. |
| clerk/skills | `clerk-testing` | Playwright/Cypress E2E patterns — the app is Expo/React Native, not a Playwright-testable web app. |
| clerk/skills | `clerk-android`, `clerk-swift` | Native Android (Kotlin) / native iOS (Swift) auth — this is an Expo/React Native app, not a native Android or Swift project. |
| clerk/skills | `clerk-astro-patterns`, `clerk-chrome-extension-patterns`, `clerk-nextjs-patterns`, `clerk-nuxt-patterns`, `clerk-react-patterns`, `clerk-react-router-patterns`, `clerk-tanstack-patterns`, `clerk-vue-patterns` | Web-framework-specific integration patterns for frameworks not in this stack. `clerk-expo` covers the client; `clerk-backend-api`/`clerk-orgs` already document the framework-agnostic `@clerk/backend` `verifyToken` pattern a Hono server needs. |
| stripe/ai | `stripe-directory`, `stripe-pay` | Let the *agent itself* look up and pay a Stripe business/handle on the user's behalf — inappropriate to vendor into a coding-assistant skill set regardless of relevance. |
| stripe/ai | `stripe-projects`, `stripe-apps`, `metronome`, `connect-recommend`, `connect-required-verification-information` | Infra-provisioning, Stripe Apps (Dashboard extensions), usage-based billing, and Connect/marketplace onboarding — none apply to a single-business booking app taking direct payments. |
| stripe/ai | `upgrade-stripe`, `stripe-docs` | Version-migration guide (nothing to migrate yet) and a CLI-docs-browser that needs the `stripe` CLI logged in; `stripe-best-practices` already covers what's needed pre-integration. |
| honojs/skills | `hono-jsx` | Server-rendered JSX helper; the backend is a JSON API only (single Hono function per `BUILD_PLAN.md`), no HTML rendering. |
| (searched, none found) | Official Meta/WhatsApp Business skill | No official Meta-published Claude/agent skill exists as of 2026-09-24 (checked officialskills.sh and Meta's GitHub orgs); used the two best community repos instead (see above), only after reading every file in both. |
| (searched, none found) | Official react-native-reusables / shadcn-for-RN skill | Doesn't exist; only community forks (e.g. `maikotrindade/awesome-react-native-skills`) bundle an "RN Reusables" skill, unverified as official — not vendored. `react-native-skills` (Vercel) and `composition-patterns` cover the component-architecture guidance instead. |
| (evaluated, not vendored) | shadcn/ui's official skill (`ui.shadcn.com/docs/skills`) | It's generated by `npx shadcn` from a project's own `apps/mobile/components.json` (web/Radix-oriented), not a static repo to vendor, and not a direct fit for react-native-reusables' RN primitives. If the team wants it, run `npx shadcn add` (or the RNR equivalent) locally to regenerate it against this project's actual component set — "install yourself" rather than vendored here. |

## Notes on licensing

Every installed skill is **MIT-licensed**, either via a root `LICENSE` file in its source repo or an
explicit `license: MIT` field in its own `SKILL.md` frontmatter (or both). Two Vercel skills
(`web-design-guidelines`) don't carry a per-file `license:` field, but
vercel-labs/agent-skills' repo-level `README.md` states the whole repository is MIT. No skill
considered for this install had a license that forbade redistribution, so nothing needed to be
listed as "install yourself" for licensing reasons — the "install yourself" entries above are all
because no suitable official artifact exists to vendor, not because of licensing.
