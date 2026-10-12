# Mobile app (WS-D)

Expo app for business owners and staff (`/`, this repo's root). Customers never see this app — they
book through WhatsApp and the public `/book/[slug]` comparator. See `docs/BUILD_PLAN.md` §6 for the
contract this implements and `docs/clerk-setup.md` for the Clerk dashboard side.

## Stack and versions

| Layer | Package | Version |
| --- | --- | --- |
| Framework | `expo` | ~57.0.25 |
| Router | `expo-router` | ~57.0.23 |
| UI runtime | `react`, `react-dom` | 19.2.3 |
| Native | `react-native` | 0.86.3 (New Architecture, default on SDK 57) |
| Styling | `nativewind` | ^4.2.7 (Tailwind v3 syntax; see `apps/mobile/tailwind.config.cjs`) |
| Animation | `react-native-reanimated` + `react-native-worklets` | ~4.5.1 / ~0.10.0 |
| Auth | `@clerk/expo` | ^4.6.9 (Core 3) |
| Server state | `@tanstack/react-query` | ^5 |
| Data reads | `@supabase/supabase-js` | ^2 (RLS, Realtime) |
| Dev builds | `expo-dev-client` | ~57.0.19 |

`@clerk/clerk-expo` (Core 2) is **not** a dependency — this app only ever used `@clerk/expo`.
`react-native-reanimated` v4 requires `react-native-worklets`; `babel-preset-expo` wires the
`react-native-worklets/plugin` Babel plugin automatically once the package is installed (no manual
`apps/mobile/babel.config.cjs` entry needed — see its `plugins/expo.js`).

## Dev builds (not Expo Go)

Clerk's native components (`AuthView`, `UserButton`, `UserProfileView`, used everywhere auth-related)
require a **development build**, not Expo Go and not a browser:

```bash
cd apps/mobile
npx expo prebuild --clean     # only needed after changing native config (apps/mobile/app.json plugins)
npx expo run:ios              # or: eas build --profile development --platform ios
npx expo run:android          # or: eas build --profile development --platform android
npx expo start --dev-client   # once a dev build is installed, this is the daily loop
```

`npx expo start --web` runs the app in a normal browser — the `(auth)` screens have a `.web.tsx`
sibling that renders Clerk's web components instead of the native ones (see `apps/mobile/src/app/(auth)/`), so web
works without a dev client.

EAS profiles (`apps/mobile/eas.json`): `development` (dev client, internal distribution, `development` channel),
`preview` (internal distribution, `preview` channel), `production` (auto-incrementing build number,
`production` channel). Each profile's `env` block needs real values — the committed file has
placeholders.

## Folder conventions

```
apps/mobile/src/
  app/                 Expo Router routes (thin — no business logic in a route file)
    _layout.tsx        ClerkProvider → QueryClientProvider → ThemeProvider → Slot/Toaster/PortalHost
    (auth)/            public: sign-in only (no sign-up — accounts are invited)
    (app)/             protected: requires sign-in + an active organisation; the tab bar
    (dev)/gallery.tsx  every ui/ + composite component, redirects away when `__DEV__` is false
    book/[slug].tsx     public web-booking comparator placeholder
  components/
    ui/                react-native-reusables primitives (shadcn for RN) — see below
    *.tsx              app-level composites: Screen, Header, EmptyState/ErrorState/LoadingState,
                       ListItem, StatCard, StatusBadge, SegmentedControl, FormField, SearchInput,
                       ConfirmDialog, Sheet, Toaster, ClerkUserButton (+ .web.tsx)
  features/<feature>/  hooks.ts (TanStack Query reads via supabase, writes via api), components/,
                       pure logic.ts + __tests__/ — appointments, bookings, business, calendar,
                       catalog (services/staff), clients, dashboard, settings
  hooks/               useAppColorScheme (NativeWind dark mode + persistence)
  lib/                 supabase.ts, api.ts, query.ts, env.ts, theme.ts, i18n/, toast.ts, idempotency.ts
```

`apps/mobile/src/lib/api.ts` and `apps/mobile/src/lib/supabase.ts` are the only two ways the app talks to the backend: reads go
through `supabase` (RLS-scoped, `accessToken` is Clerk's `getToken`), every write goes through `api`
(bearer + a per-action `Idempotency-Key`, minted by `IdempotencyTracker` and reused on retry). Never
call `fetch` or `supabase.rpc` for a write directly from a screen.

## Adding a react-native-reusables component

`apps/mobile/components.json` points the **shadcn CLI** and the **shadcn MCP server** (`docs/mcp.md`) at the
react-native-reusables registry:

```bash
npx shadcn@latest add <component>       # e.g. `npx shadcn@latest add slider`
```

or ask the shadcn MCP tool to add it. Either way it writes into `apps/mobile/src/components/ui/`, matching this
project's `style: "new-york"`, `baseColor: neutral`, alias map (`@/components`, `@/lib/utils`, …) — the
same conventions the hand-written `ui/` components already follow (NativeWind `className` + `cn()`,
`cva` variants, a `Platform.select({ web: ... })` split for web-only Tailwind states, and a `Portal` +
`FullWindowOverlay` pattern for anything that floats: dialog, popover, dropdown-menu, select, tooltip,
hover-card, context-menu, menubar). If the CLI's network is unavailable in your environment (some
sandboxes block it), write the component by hand following an existing one of the same shape — dialog.tsx
for anything with an overlay, toggle.tsx for anything `cva`-variant-based — and add its `@rn-primitives/*`
package to `package.json` if it needs one.

The current set covers everything in the design system brief: accordion, alert, alert-dialog,
aspect-ratio, avatar, badge, button, card, checkbox, collapsible, context-menu, dialog, dropdown-menu,
hover-card, icon, input, label, menubar, popover, progress, radio-group, select, separator, skeleton,
switch, tabs, text, textarea, toggle, toggle-group, tooltip.

## Tokens and theming

`apps/mobile/global.css` defines light/dark HSL channel variables (shadcn convention: `--primary`, `--background`,
…) plus this project's own `--brand`, `--success`, `--warning`, `--whatsapp` (each with a `-soft` tint)
and `--status-*` (confirmed/pending/completed/cancelled). `apps/mobile/tailwind.config.cjs` maps them to Tailwind
color tokens. `apps/mobile/src/lib/theme.ts` mirrors the light/dark values as raw HSL strings for places that need a
JS color (the nav theme, `RefreshControl`, SVG strokes) and exports `NAV_THEME`, consumed by
`apps/mobile/src/components/ThemeProvider.tsx` (`expo-router`'s `ThemeProvider`, so headers/tab bars/status bar all
match). `useAppColorScheme` (in `apps/mobile/src/hooks/`) wraps NativeWind's `useColorScheme`, persists the explicit
choice to `AsyncStorage`, and defaults to the system scheme otherwise. Brand colors: primary `#0B6A8F`,
accent `#2E8FC4` (the `brand` token), page background `#F5F7FB`, white cards, 12–16px radius
(`--radius: 0.875rem`).

## Route map

| Route | Group | Notes |
| --- | --- | --- |
| `/sign-in` | `(auth)` | native `AuthView` (`mode="signIn"`) / web `<SignIn />`; redirects to `/` if already signed in |
| `/` | `(app)` (tabs) | Dashboard: `dashboard_summary` RPC + today's schedule, check-in |
| `/calendar` | `(app)` (tabs) | Day/week/month from `appointments` + `business_hours` (breaks = gaps between shifts) |
| `/add` | `(app)` (tabs) | Add booking: client search/new client, live slots from `/v1/availability/slots`, `POST /v1/appointments`. Params `clientId`, `mode=new` |
| `/bookings/[id]` | `(app)` | Booking detail + cancel (`/v1/appointments/:id/cancel`) |
| `/clients` | `(app)` (tabs) | Paged client list, search, All/Recent (seen ≤ 30 days)/VIP (`tags` contains `VIP`) |
| `/clients/[id]` | `(app)` | Client profile, notes (add via API), stats and booking history |
| `/settings` | `(app)` (tabs) | Profile (Clerk), role (`/v1/me`), WhatsApp status (`whatsapp_accounts`), links below |
| `/settings/business-details` · `operating-hours` · `services` · `staff-management` | `(app)` | Read via Supabase, save via the owner-only `/v1` routes (hidden for staff) |

Every `(app)` screen subscribes to `appointments` Realtime once (in `(app)/_layout.tsx`), which invalidates
the appointment, dashboard and client queries. Availability is fetched with `staleTime: 0` and never cached.
| `/book/[slug]` | — (public) | web-booking comparator placeholder, no auth |
| `/gallery` | `(dev)` | component gallery, redirects to `/` when not `__DEV__` |
| `/+not-found` | — | 404 |

`(app)/_layout.tsx` gates on `useAuth()` (redirects to `/sign-in` when signed out) **and** on having an
active `useOrganization()` — it activates the first `useOrganizationList()` membership automatically
when none is active yet, and renders `NoBusinessScreen` (with sign-out) when the user has none at all.

## Tooling

- `npm run lint` / `npx tsc --noEmit` / `npm run test:no-watch` must stay green. All three (plus root
  ESLint's `ignores` and root `tsconfig.json`'s `exclude`) deliberately skip `apps/backend/` and `supabase/`
  — those have their own toolchains (`docs/BUILD_PLAN.md` §2).
- `npm run export:web` / `npm run export:android` (`expo export --platform …`) are the fastest way to
  catch a bundling regression without a full EAS build.
- Tests live next to what they cover in `__tests__/` folders and use `react-test-renderer` directly
  (no `@testing-library/react-native`, to keep the dependency graph small for a scaffold this size).
- `@shared/*` resolves to `../shared/*` (see `tsconfig.json` `paths`) — Metro also honours it natively
  since Expo SDK 50 added built-in `tsconfig.json`/`jsconfig.json` path-alias support, no extra Babel
  plugin required.

## Deviations from a from-scratch setup

- `ios.bundleIdentifier` and `android.package` are both `com.neighborhoodpicks.app` — there was no
  existing iOS product to derive a different identifier from, and Clerk's native SDK needs *some* iOS
  bundle id registered (`docs/clerk-setup.md` §7). Change both together if iOS ever ships under a
  different identifier.
- `expo-symbols`, `expo-haptics`, `expo-notifications`, `expo-device` and `expo-clipboard` are installed
  but not yet used by any screen — they back planned work (push tokens for `device_push_tokens`, haptic
  feedback, share links) rather than dead weight from the original boilerplate.
