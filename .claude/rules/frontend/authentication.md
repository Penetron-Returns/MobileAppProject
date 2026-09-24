---
paths: apps/mobile/src/app/**/_layout.tsx,apps/mobile/src/app/(auth)/**,apps/mobile/src/lib/supabase.ts,apps/mobile/src/lib/api.ts,apps/mobile/src/lib/clerk*.ts
description: Rules for Clerk authentication using Clerk's prebuilt UI only, organisations and tokens
---

# Authentication

Authentication is Clerk, using **Clerk's prebuilt UI only**. Businesses are Clerk organisations, and roles map `org:admin` → owner and `org:member` → staff. See [clerk-setup.md](/docs/clerk-setup.md).

## Implementation

1. Use Clerk components for every auth surface: `AuthView` (native sign-in), `UserButton`/`UserProfileView` (account), and the Clerk web components on web. Never build custom sign-in, sign-up or password forms.
2. Guard `(app)` routes on `isSignedIn` **and** an active organisation. Activate the first membership when none is active, and show "No business linked" when there are none.
3. Pass Clerk's session token to Supabase via `accessToken: async () => (await getToken()) ?? null`, and to the API as `Authorization: Bearer`. Never use Supabase Auth.
4. Hide owner-only UI for staff using the role from `/v1/me`, knowing the API enforces it anyway.
5. Store tokens only through Clerk's secure-store token cache.

## Examples

```tsx
// ✅ DO
<AuthView mode="signIn" />

// ❌ DON'T
<Input placeholder="Email" /><Input secureTextEntry /><Button onPress={() => signIn.create(…)} />
```
