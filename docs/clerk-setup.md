# Clerk setup (WS-D)

Dashboard checklist for the Clerk instance this app and `apps/backend/` share. There are no custom auth
forms anywhere in the app — every screen uses Clerk's prebuilt UI (`@clerk/expo/native` on iOS/Android,
`@clerk/expo/web` on web). This file is the "do this in the Clerk Dashboard" companion to that code;
the code itself is `apps/mobile/src/app/(auth)/`, `apps/mobile/src/app/(app)/_layout.tsx`, `apps/mobile/src/lib/clerk-token-cache.ts` and
`apps/mobile/src/lib/auth-token.ts`.

## 1. Organizations

Dashboard → **Organizations** → enable Organizations.

- **Membership mode: Optional.** The app (not Clerk's hosted `choose-organization` task) decides what
  to show a member with no active organisation — `(app)/_layout.tsx` activates the first membership
  automatically, or renders a "No business linked" screen with sign-out when the user has none. Using
  "Membership required" would insert Clerk's own hosted org-chooser in front of that screen.
- **Roles.** Dashboard → Organizations → **Roles**. Keep the two default roles and rename their intent
  to match `docs/BUILD_PLAN.md`'s `member_role` enum:
  - `org:admin` → **owner** (full access; the business's admin)
  - `org:member` → **staff**
- One business = one Clerk organisation (`businesses.clerk_org_id`, see `docs/database.md`). The API
  reads the role from the org membership, never from a separate column.

## 2. Sign-up mode

Dashboard → **User & authentication**. Sign-up is `public` on the dev instance, and the app's `AuthView`
is rendered with `mode="signInOrUp"` (web `<SignIn />` links to sign-up), so users can create their own
account. Staff can still be invited from inside a Clerk organisation. Review the sign-up mode before
production.

## 3. Session token (v2)

Dashboard → **Sessions** → **Customize session token**, on the v2 (default) format. The RLS helper in
`supabase/migrations` (`private.current_org_id()`) reads `o.id` / `o.rol` from the v2 shape
(`{"o": {"id": "...", "rol": "..."}}`), falling back to the v1 `org_id` claim. No custom claims need
adding — v2 already includes the active organisation.

## 4. Supabase third-party auth

Two integrations, both required, per `docs/database.md`:

1. **Supabase side** — Dashboard (supabase.com) → your project → **Authentication → Third-party auth**
   → add **Clerk** as a provider. Supabase then trusts Clerk-issued JWTs directly (no shared secret,
   no Supabase JWT template) via `accessToken()` on the client (see `apps/mobile/src/lib/supabase.ts`).
2. **Clerk side** — Clerk Dashboard → **Integrations** → enable the **Supabase** integration. This is
   what makes Clerk issue tokens Supabase's third-party auth accepts.

The mobile app never talks to Supabase Auth — `createClient<Database>(url, anon, { accessToken })`
in `apps/mobile/src/lib/supabase.ts` calls Clerk's `getToken()` (wired up by `AuthTokenBridge`) on every request.
Every table's only RLS policy for `authenticated` is a read (`SELECT ... business_id = private.current_business_id()`) —
all writes go through `apps/backend/` with the service-role key.

## 5. Webhook

Dashboard → **Webhooks** → add an endpoint at `<API_BASE_URL>/webhooks/clerk` (see
`apps/backend/src/routes/clerk.ts`), subscribed to:

- `organization.created`, `organization.updated`, `organization.deleted`
- `user.created`, `user.updated`, `user.deleted`
- `organizationMembership.created`, `organizationMembership.updated`, `organizationMembership.deleted`

Copy the endpoint's **Signing secret** into `CLERK_WEBHOOK_SECRET` (backend env; the route verifies it
with `svix`, see `docs/BUILD_PLAN.md` §7).

## 6. Backend JWT verification

`CLERK_JWT_KEY` (backend env) is the instance's PEM public key — Dashboard → **API keys** → **Show JWT
public key** — so `apps/backend/` can verify session tokens networklessly (`@clerk/backend`'s
`verifyToken`). `CLERK_SECRET_KEY` and `CLERK_AUTHORIZED_PARTIES` (the app's native scheme(s) and web
origin(s), comma-separated) are also required; see `docs/BUILD_PLAN.md` §7.

## 7. Native applications (required for `AuthView` / `UserButton`)

Dashboard → **Native applications** (`https://dashboard.clerk.com/~/native-applications`) → enable the
Native API, then register the app:

- **Android**: package name `si.nerova.booking.dev` (`apps/mobile/app.json` → `expo.android.package`; a **dev placeholder** that must be
  finalised before a store release, see `docs/environments.md`) plus the **SHA-256 certificate fingerprint** of the signing key of the build
  (`eas credentials -p android` for EAS `preview`/`development` builds; a local prebuild debug key has a different fingerprint, register it too if used).
- **iOS**: bundle identifier `si.nerova.booking.dev` (from `apps/mobile/app.json` → `expo.ios.bundleIdentifier`).
  iOS is not distributed yet (no Apple Developer account); it reuses the same placeholder id. Change both together when the final id is chosen.

The `@clerk/expo` config plugin (`apps/mobile/app.json` → `expo.plugins`) sets the iOS deployment target (17.0) and
Android packaging/Kotlin options the native SDKs need; run `npx expo prebuild --clean` (or an EAS build)
after any change to it, and see `docs/mobile-app.md` for why a **development build** is required —
`AuthView`/`UserButton`/`UserProfileView` do not run in Expo Go.

## 8. Allowed web origins

Dashboard → **Domains** (or **Paths**, depending on the dashboard version) → add every web origin that
serves this app: local dev (`http://localhost:8081` for `expo start --web`), EAS/Vercel preview URLs,
and the production web origin. `@clerk/expo/web`'s components (used by `*.web.tsx` screens) and the
Frontend API's CORS checks both key off this list.

## 9. Environment variables

| Variable | Where | Source |
| --- | --- | --- |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | app (`.env.local`, EAS `env`) | Dashboard → API keys → Publishable key |
| `CLERK_SECRET_KEY` | `apps/backend/` | Dashboard → API keys → Secret key |
| `CLERK_JWT_KEY` | `apps/backend/` | Dashboard → API keys → Show JWT public key (PEM) |
| `CLERK_AUTHORIZED_PARTIES` | `apps/backend/` | the app's scheme(s) (`bookingadmin://`; unchanged by the package id) and web origin(s), comma-separated |
| `CLERK_WEBHOOK_SECRET` | `apps/backend/` | the webhook endpoint's signing secret (step 5) |

## Sources

- Expo native components: <https://clerk.com/docs/reference/expo/native-components/overview>
- Expo quickstart (token cache, `ClerkProvider`): <https://clerk.com/docs/quickstarts/expo>
- Organizations overview: <https://clerk.com/docs/guides/organizations/overview>
- Session tokens (v2 claims): <https://clerk.com/docs/guides/sessions/session-tokens>
- Supabase third-party auth with Clerk: <https://clerk.com/docs/guides/development/integrations/databases/supabase>
- Svix webhook verification: <https://clerk.com/docs/guides/development/webhooks/syncing>
