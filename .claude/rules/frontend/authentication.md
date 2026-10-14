---
paths: apps/mobile/src/app/**/_layout.tsx,apps/mobile/src/app/(auth)/**,apps/mobile/src/lib/supabase.ts,apps/mobile/src/lib/api.ts,apps/mobile/src/lib/clerk*.ts
description: Rules for Clerk authentication using our own sign-in UI on Clerk's headless hooks, organisations and tokens
---

# Authentication

Authentication is Clerk, using **our own sign-in / sign-up UI on Clerk's headless hooks** (`useSignIn`, `useSignUp`, `useSSO`); the prebuilt `AuthView` is no longer used. Businesses are Clerk organisations, and roles map `org:admin` → owner and `org:member` → staff. See [clerk-setup.md](/docs/clerk-setup.md).

## Implementation

1. Build sign-in and sign-up only on Clerk's headless hooks (`features/auth/`); never bypass them or handle codes, passwords or rate limits ourselves. Use `UserButton`/`UserProfileView` for the account UI and Clerk's web components on web.
2. Guard `(app)` routes on `isSignedIn` **and** an active organisation. Activate the first membership when none is active, and show "No business linked" when there are none.
3. Pass Clerk's session token to Supabase via `accessToken: async () => (await getToken()) ?? null`, and to the API as `Authorization: Bearer`. Never use Supabase Auth.
4. Hide owner-only UI for staff using the role from `/v1/me`, knowing the API enforces it anyway.
5. Store tokens only through Clerk's secure-store token cache.

## Examples

```tsx
// ✅ DO: Clerk's hooks do the verification
const { error } = await signIn.emailCode.sendCode({ emailAddress });

// ❌ DON'T: roll your own credential check
await fetch('/my-login', { body: JSON.stringify({ email, password }) });
```
