# Environments and the shared dev setup

This is the free edition: no AI, payment or billing services need configuring.

Three environments. Only `local` and the shared `dev` exist today.

| | local | `dev` (shared, hosted) | `prod` (later) |
| --- | --- | --- | --- |
| Who | one developer | all friends (devs + testers) | real customers |
| Supabase | `supabase --workdir packages/database start` (Docker) | one hosted project | separate hosted project |
| API | `npm run dev:api` | `api` Edge Function on the dev project | same, prod project |
| Clerk | dev instance (shared) | dev instance | separate production instance |
| WhatsApp | none | Meta test number (optional) | real numbers |
| App | `npm run dev:mobile` (dev client) | EAS `preview` Android APK | EAS `production` |
| Secrets | `.env` files or Doppler `dev` | Doppler `dev` + Supabase secrets + EAS env | Doppler `prod` (to be created) |
| Seed data | `supabase --workdir packages/database db reset` seeds the demo business | demo seed once, see step 1.5 | never |

**Platform for the first iteration: Android only.** The UI is designed iOS-style but friends get an Android APK
because there is no Apple Developer account yet. iOS comes in the "Later" section.

## Where things live

- **Doppler** project `booking`, config `dev`: every secret and public key for dev (source of truth for people).
  `doppler.yaml` maps `apps/api` and `apps/mobile` to it.
- **Supabase Edge Function secrets**: copied from Doppler by `npm run env:push-secrets`. Supabase injects
  `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` itself.
- **Supabase Vault**: `api_base_url` and `cron_secret`, used by pg_cron (not environment variables).
- **EAS environment variables** (`development`, `preview`, `production`): the four `EXPO_PUBLIC_*` values baked into app builds.
  `apps/mobile/eas.json` only names the environment per profile; it holds no values.
- **GitHub repo secrets**: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` for `deploy-dev.yml`.
- Never commit secrets or real project refs. `.env*.local`, `*.pem` and `*.jks` are git-ignored.

## Stand up the shared dev environment (about 30 minutes)

Run `scripts/env/*` and `npm run` commands from Git Bash on Windows.

### 1. Supabase hosted project

1. Create a project (name it e.g. `booking-dev`, pick a region near testers). Save the database password in Doppler as `SUPABASE_DB_PASSWORD`.
2. Install the CLI, then `supabase login` and `supabase --workdir packages/database link --project-ref <dev-ref>`.
3. `supabase --workdir packages/database db push` applies every migration. The cron migration is safe before the Vault secrets exist (jobs skip with a warning).
4. Project settings (see `docs/database.md`): exposed schemas `public` only; extra search path `public, extensions`.
5. Seed policy: the demo business (`packages/database/supabase/seed.sql`, org id `org_demo_ashgrove`) is optional on dev. Prefer a real
   business created through Clerk so org ids match. If you want demo data once:
   `psql "$(supabase --workdir packages/database db url --linked)" -f packages/database/supabase/seed.sql`. Never seed `prod`. The seed is not re-run by CI.
6. Vault (SQL editor), once; see `docs/database.md` "Vault secrets for cron":
   ```sql
   select vault.create_secret('https://<dev-ref>.supabase.co/functions/v1/api', 'api_base_url');
   select vault.create_secret('<same value as CRON_SECRET>', 'cron_secret');
   ```
7. Authentication, Third-Party Auth, add **Clerk** with your Clerk domain (step 2.6).
8. Collect from Settings, API: project URL and anon key. They go to Doppler / EAS as `EXPO_PUBLIC_SUPABASE_*`.
9. Generate secrets locally and put them in Doppler: `CRON_SECRET` and `FLOW_TOKEN_SECRET` (random strings),
   `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`). `API_BASE_URL` is `https://<dev-ref>.supabase.co/functions/v1/api`.
10. After Clerk (below): `SUPABASE_PROJECT_REF=<dev-ref> npm run env:push-secrets` (add `-- --dry-run` first to list names), then
    `supabase --workdir packages/database functions deploy api` (or run the `Deploy dev` workflow). `config.toml` already sets `verify_jwt = false`.
11. Check: `curl https://<dev-ref>.supabase.co/functions/v1/api/health` returns `{"data":{"ok":true,...}}`.

### 2. Clerk dev instance

Full detail in `docs/clerk-setup.md`. Summary:

1. Create an application (development instance). Enable **Organizations**, membership mode **Optional**.
   `org:admin` = owner, `org:member` = staff.
2. **Invite-only**: restrict sign-up so accounts exist only by invitation (clerk-setup section 2).
3. Session token stays v2. Enable the **Supabase** integration (adds the `role: authenticated` claim) and copy the Clerk domain.
4. Webhook: endpoint `https://<dev-ref>.supabase.co/functions/v1/api/webhooks/clerk` with the events in clerk-setup section 5.
   Signing secret goes to `CLERK_WEBHOOK_SECRET`.
5. Backend keys to Doppler: `CLERK_SECRET_KEY`, `CLERK_JWT_KEY` (PEM, "Show JWT public key"), `CLERK_WEBHOOK_SECRET`,
   `CLERK_AUTHORIZED_PARTIES`. Publishable key goes to `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`.
   Multi-line PEMs: Doppler stores them fine, the backend accepts `\n` escapes or real newlines.
6. Supabase third-party auth uses the Clerk domain from step 3 (Supabase step 7). Local `supabase --workdir packages/database start` needs `export CLERK_DOMAIN=...`.
7. **Native application (Android)**: Clerk Dashboard, Native applications, enable Native API, add Android with the final package name
   (see "Android package name" below) and the **SHA-256 certificate fingerprint of the signing key EAS uses**
   (`eas credentials -p android`, choose the build profile, copy SHA-256; the debug and release/EAS keystores differ, so register each one you ship).
   `CLERK_AUTHORIZED_PARTIES` should contain the app scheme (`bookingadmin://`) and any web origin (comma-separated).
8. Allowed web origins: add `http://localhost:8081` and any Expo web preview URL.

### 3. Meta WhatsApp test number (optional)

Only needed to try the deterministic WhatsApp engine; the app, web flow and API work without it.
Create a Meta app with a WhatsApp test number, then follow `docs/whatsapp.md`: `META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`,
Flow keys via `node packages/app-store/whatsapp/scripts/generate-flow-keys.mjs`, `WHATSAPP_REGISTRATION_PIN`, and a system-user token passed to
`POST /v1/whatsapp/connect` (stored encrypted, never in Doppler). Webhook callback: `<API_BASE_URL>/webhooks/whatsapp`.

### 4. EAS and the Android build

1. `npm i -g eas-cli`, `eas login`, then in `apps/mobile`: `eas init` (writes the project id into `app.json`; commit it).
2. Change the Android package name **before the first build** (see below).
3. EAS environment variables, one set per environment (`preview` for testers, `development` for dev clients):
   ```bash
   cd apps/mobile
   eas env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://<dev-ref>.supabase.co/functions/v1/api --visibility plaintext
   eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://<dev-ref>.supabase.co --visibility plaintext
   eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key> --visibility plaintext
   eas env:create --environment preview --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value <pk_test_...> --visibility plaintext
   eas env:create --environment preview --name EXPO_PUBLIC_ENV --value dev --visibility plaintext
   ```
   Repeat for `development`. These are public by design (inlined into the bundle); never put a secret in an `EXPO_PUBLIC_*` variable.
4. Testers: `eas build -p android --profile preview`. `preview` is `distribution: internal` with `android.buildType: apk`, so EAS gives an
   install link and QR code. Share it; testers enable "install unknown apps" on the phone. Developers: `eas build -p android --profile development`
   gives an Android dev client APK, then `npm run dev:mobile`.
5. First Android build lets EAS generate and store the keystore. Run `eas credentials -p android` afterwards to read the SHA-256 for Clerk (2.7).
6. iOS device builds need an Apple Developer account. Until then iOS developers use the iOS simulator and testers can use the Expo web build
   (`cd apps/mobile && npm run export:web`; host it anywhere and add its origin in Clerk, step 2.8).

### 5. Inviting friends

- **Clerk**: Dashboard, Organizations, the shared dev business org, Invite members (`org:admin` for owner-like testers, `org:member` for staff).
  They sign in with the invited email; sign-up is closed otherwise. Their user rows appear through the Clerk webhook.
- **Doppler** (developers only): invite to the `booking` project with access to `dev`; then each friend runs
  `doppler login` and `doppler setup` in the repo root (picks up `doppler.yaml`), then `npm run env:check` and `npm run dev:api` / `npm run dev:mobile`.
  Testers need only the EAS install link, never Doppler.
- **GitHub / EAS / Supabase**: add developers who deploy as collaborators; testers need nothing.

## Everyday commands

| Task | Command |
| --- | --- |
| Check env is complete | `npm run env:check` (names only); one app: `sh scripts/env/check.sh api --hosted` |
| Run API locally | `npm run dev:api` (Doppler if available, else `apps/api/.env`) |
| Run app | `npm run dev:mobile` (Doppler if available, else `apps/mobile/.env.local`) |
| Push secrets to hosted dev | `SUPABASE_PROJECT_REF=<ref> npm run env:push-secrets` |
| Deploy dev | merge to `develop`, or run the `Deploy dev` workflow |

Without Doppler, copy each `.env.example` to `apps/api/.env` and `apps/mobile/.env.local` and fill them.

## CI

- `test-on-pr.yml` runs on pull requests to `main` and `develop`.
- `deploy-dev.yml` (push to `develop` or manual) runs `supabase --workdir packages/database link`, `supabase --workdir packages/database db push` and `supabase --workdir packages/database functions deploy api`.
  Repo secrets: `SUPABASE_ACCESS_TOKEN` (account access token), `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` (dev project ref).
  Create a `develop` branch from `main` first. A `Deploy dev` run touches the shared database, so keep migrations additive.

## Android package / iOS bundle id (dev placeholder)

The app has no name yet, so `apps/mobile/app.json` uses the **placeholder `si.nerova.booking.dev`** for both `expo.android.package` and
`expo.ios.bundleIdentifier` (the founder owns `nerova.si`; `com.android.*` is reserved by Google and cannot be used). The URL scheme
`bookingadmin` is unchanged (no conflict).

- Internal APK installs (EAS `preview` / `development`) can change the id later: testers uninstall and reinstall, and you re-register the new
  package and certificate fingerprint in Clerk (Native applications). Nothing else depends on it.
- The final id **must be chosen before the first Play Store or App Store release**: it is permanent there (listing, signing and updates are
  tied to it). Do not publish with the `.dev` placeholder.

Because native projects are generated (next section), picking the final id means editing only:

1. `apps/mobile/app.json`: `expo.android.package` and `expo.ios.bundleIdentifier`.
2. Clerk Dashboard, Native applications: new Android package plus the SHA-256 of the EAS keystore (and the iOS bundle id later).
   `CLERK_AUTHORIZED_PARTIES` holds the app scheme (`bookingadmin://`), which does not change with the id.
3. Docs that name it: `docs/clerk-setup.md` section 7, `docs/mobile-app.md` "Deviations".

Check: `grep -rn "si.nerova.booking" apps docs --exclude-dir=node_modules`.

## Native projects are generated (prebuild / CNG)

`apps/mobile/android/` was removed from git and `/android` and `/ios` are git-ignored. EAS Build runs `expo prebuild` from `app.json` and
config plugins (such as `@clerk/expo`) on every build, so config changes and the package id apply automatically and cannot drift from
hand-edited native files. The app has no hand-written native code. For a local native run use `npx expo prebuild --clean` then
`npm run android`; the generated folders stay untracked. If custom native code is ever needed, write a config plugin rather than committing the folder.
The old committed folder also used a checked-in `debug.keystore`; local debug builds now get Expo's default debug key, so their SHA-256
differs from the EAS one (register whichever you use in Clerk).

## Later: iOS

When an Apple Developer account exists: add the final bundle id to Clerk Native applications, run `eas device:create` for internal distribution
(ad hoc, registered devices only) or use TestFlight via `eas submit`, run `eas build -p ios --profile preview`, and add the iOS team id in
Clerk's native app registration. The `preview` EAS environment variables are shared with iOS.
