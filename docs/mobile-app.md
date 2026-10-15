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
| Design system | `@booking/ui` (`packages/ui`, npm workspace) | see [design-system.md](design-system.md) |

`@clerk/clerk-expo` (Core 2) is **not** a dependency — this app only ever used `@clerk/expo`.
`react-native-reanimated` v4 requires `react-native-worklets`; `babel-preset-expo` wires the
`react-native-worklets/plugin` Babel plugin automatically once the package is installed (no manual
`apps/mobile/babel.config.cjs` entry needed — see its `plugins/expo.js`).

## Dev builds (not Expo Go)

Clerk's native components (`UserButton`, `UserProfileView`) require a **development build**, not Expo Go and not a browser:

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

`@react-native-community/netinfo` is a native module (it feeds connectivity to TanStack `onlineManager` in `src/lib/online.ts`), so rebuild the dev client once after pulling it in.

Offline rules: queries pause offline and screens show their saved copy with `SavedCopyBanner`; a first load with nothing saved reads as an `OFFLINE` error (`loadError` in `src/lib/offline.ts`); writes are never queued (`useApiMutation` refuses them with the `errors.codes.OFFLINE` copy). Every sign-out goes through `useSignOut`, which empties the query cache.

EAS profiles (`apps/mobile/eas.json`): `development` (dev client, internal distribution, `development` channel),
`preview` (internal distribution, `preview` channel), `production` (auto-incrementing build number,
`production` channel). Each profile's `env` block needs real values — the committed file has
placeholders.

## Folder conventions

```
apps/mobile/src/
  app/                 Expo Router routes (thin — no business logic in a route file)
    _layout.tsx        ClerkProvider → QueryClientProvider → ThemeProvider → Slot/Toaster/PortalHost
    (auth)/            public: welcome / email / code (custom UI on Clerk's headless hooks, `features/auth/`)
    (app)/             protected: requires sign-in + an active organisation; the tab bar
    (dev)/gallery.tsx  every token, primitive, component and pattern of the design system, light/dark/both;
                       redirects away when `__DEV__` is false (sections in features/gallery/)
    book/[slug].tsx     public web-booking comparator placeholder
  components/          app-only pieces: AuthTokenBridge, ConfigErrorScreen, ThemeProvider.
                       Every shared UI component lives in packages/ui (@booking/ui)
  features/<feature>/  hooks.ts (TanStack Query reads via supabase, writes via api), components/,
                       pure logic.ts + __tests__/ — appointments, bookings, business, calendar,
                       catalog (services/staff), clients, dashboard, inbox, settings, today
  hooks/               useDebouncedValue, useNow
  lib/                 supabase.ts, api.ts, query.ts, env.ts, theme.ts, i18n/, toast.ts, idempotency.ts
```

`apps/mobile/src/lib/api.ts` and `apps/mobile/src/lib/supabase.ts` are the only two ways the app talks to the backend: reads go
through `supabase` (RLS-scoped, `accessToken` is Clerk's `getToken`), every write goes through `api`
(bearer + a per-action `Idempotency-Key`, minted by `IdempotencyTracker` and reused on retry). Never
call `fetch` or `supabase.rpc` for a write directly from a screen.

## Design system

All shared UI lives in the `@booking/ui` workspace package (`packages/ui`): tokens, primitives, components and
patterns, imported from one barrel. See [design-system.md](design-system.md) for the layout, the tokens, how to add a
component, the accessibility rules and the gallery. App code imports only `@booking/ui` (ESLint blocks the old
`@/components/...` paths and deep package imports).

### Adding a react-native-reusables component

`apps/mobile/components.json` points the **shadcn CLI** and the **shadcn MCP server** (`docs/mcp.md`) at the
react-native-reusables registry, with its aliases pointing into the package:

```bash
npx shadcn@latest add <component>       # e.g. `npx shadcn@latest add slider`
```

or ask the shadcn MCP tool to add it. Either way it writes into `packages/ui/src/rnr/`, matching this project's
`style: "new-york"` and `baseColor: neutral`. Generated files import through the aliases; change those to relative
imports (the package never imports the app), export the component from `packages/ui/src/index.ts` and add it to the
gallery's Base section. The same conventions apply as for the hand-written components (NativeWind `className` +
`cn()`, `cva` variants, a `Platform.select({ web: ... })` split for web-only Tailwind states, and a `Portal` +
`FullWindowOverlay` pattern for anything that floats). If the CLI's network is unavailable, write the component by
hand following an existing one of the same shape (`dialog.tsx` for overlays, `toggle.tsx` for `cva` variants) and
add its `@rn-primitives/*` package to `apps/mobile/package.json`.

The base set: accordion, alert, alert-dialog, aspect-ratio, badge, card, checkbox, collapsible, context-menu, dialog,
dropdown-menu, hover-card, input, label, menubar, popover, progress, radio-group, select, separator, tabs, textarea,
toggle, toggle-group, tooltip. Design-system components replaced these upstream files: `Button` (tactile primary),
`Switch`, `Avatar`, `Text`, `Icon`, `Skeleton`.

## Tokens and theming

`apps/mobile/global.css` defines the light/dark HSL channel variables (shadcn convention: `--primary`,
`--background`, ...) plus this project's own `--brand`, `--success`, `--warning`, `--whatsapp` (each with a `-soft`
tint) and `--status-*`. The same table lives in `packages/ui/src/tokens/colors.ts` (a test keeps them equal) and
`packages/ui/tailwind-preset.cjs` maps the roles, the type scale and the radii to Tailwind. `THEME` (from
`@booking/ui`) gives raw HSL strings for places that need a JS colour (SVG strokes, `RefreshControl`); `NAV_THEME` in
`apps/mobile/src/lib/theme.ts` builds the navigation theme from it and is consumed by
`apps/mobile/src/components/ThemeProvider.tsx` (`expo-router`'s `ThemeProvider`, so headers/tab bars/status bar match).
`useAppColorScheme` (`@booking/ui`) wraps NativeWind's `useColorScheme`, persists the explicit choice to
`AsyncStorage` and defaults to the system scheme otherwise. Palette (iPhone design, iOS 26 / HIG): tint = iOS system
blue (`#007AFF`, `#0A84FF` in dark) as `--primary`/`--brand`, ground `#F7F7FA` (`#0B0C10` dark), true-black / white
labels, secondary text at 0.72 alpha. Type scale (SOFT.md): `text-large-title` 34/41, `text-section` 22/28,
`text-title` 17/22, `text-subtitle` 15/20, `text-meta` 13/18 on the system font (SF on iOS).

### Depth (layered shadows and gradients)

NativeWind classes can't express the design's layered `box-shadow`s and gradients, so
`packages/ui/src/tokens/depth.ts` holds them as typed tokens (`getDepth(scheme, tint)`, light + dark, copied from the
approved `Main.dc.html` theme object): `ground`, `raised`, `hero` (one per screen), `floating`, `button`, `knob`,
`primary` (tactile) with their `*Pressed` states, `inset`, `dome`, `engrave`, `bar`, `pill`, `badge` and the status
`capsule` colours. They use React Native 0.86's CSS-style `boxShadow` (incl. `inset`) and
`experimental_backgroundImage` gradients, so `expo-linear-gradient` is not needed; each token also carries a solid
`backgroundColor` fallback. Use them through `useDepth()`, `<Surface variant="raised|hero|inset|dome|engrave">` and
`<Ground>`. Deviations from the design: domes use a linear (not radial) top highlight, and there is no backdrop blur
on the tab capsule (it is 94% opaque in the design).

Deliberate divergence from upstream react-native-reusables: `Button` `default` is the tactile primary and
`secondary` / `neutral` the raised buttons (all pill-shaped, styled from the depth tokens); sizes are `sm` h-9,
`default` h-11, `lg` h-[52px], `xl` h-14. `Switch` is the design's 51x31 green pill.

### Floating tab bar

`FloatingTabBar` (`@booking/ui`) replaces the default Tabs bar: Today · Calendar · centre "+" (opens `/add`) ·
Clients · Settings in one capsule, plus a dome above it. The centre action (`center`: `add` or `reports`) and the dome
are slots the app fills per plan through `AppTabBar`: `<InboxEntryDome />` (`features/inbox`, `useInboxEntry()`) on Free,
`<CompanionEntryDome />` (`features/companion`, `useCompanionEntry()`) on paid plans, each the single place for its plan
gating and badge count. The bar floats over content, so `Screen` and `Page` add bottom padding on the top-level tab screens
(`isTabRootPath`); screens that opt out with `tabBarStyle: { display: 'none' }` (details, settings sub-pages) hide it.

### The AI app (paid plans)

One app, two modes, chosen by the entitlements from `/v1/me` (`useAppMode()`: `companion` or `reports` means paid; never a plan name). **Free** is the research app and is unchanged: "+" opens New booking, the Inbox dome shows, Settings has WhatsApp. **Paid** (Starter R200 / 50 jobs, Growth R400 / 100, Pro R800 / 200; extra jobs R4, never cut off, warning from 80%):

- The bar's centre button opens **Reports**; the dome is the **companion dome**, which opens the companion sheet. `AppTabBar` (`components/`) wires this; `tabBarActions(mode)` (`features/plans/tabBar.ts`) is the table.
- Inbox routes (`/inbox`, `/inbox/[id]`) redirect to Today on paid plans; `/reports` and `/companion` redirect on Free (all through `Gate`).
- Manual booking stays reachable: a "New booking" action in the Calendar header, and long-pressing an empty slot of the day view opens New booking with `staffId`, `date` and `time` params (`newBookingHref`).
- **Reports** (`features/reports`): `GET /v1/reports/summary?month=`, month switcher, revenue, weekly chart, companion outcomes (`companion` is null until Nerova is linked), sources, no-shows, cancellations, busiest time, usage card (opens Plan).
- **Plan & billing** (`features/plans`, `/settings/plan`): `GET /v1/plans` and `GET /v1/billing/usage`. "Choose" goes through `startCheckout` (`checkout.ts`): it toasts "Checkout opens soon" while `checkout_url` is null and opens the URL once the API has one. "Manage subscription" stays hidden until a URL exists.
- **Companion sheet** (`features/companion`, route `/companion`, a transparent modal): `POST /v1/companion/session` with `{ color_mode }` and an Idempotency-Key returns `{ url, expires_at }`. The `react-native-webview` loads our own one-frame page with `baseUrl` set to `EXPO_PUBLIC_COMPANION_ORIGIN` (it must equal the backend's `NEROVA_EMBED_ORIGIN`; default: the API origin) because Nerova only runs the widget on an allowlisted origin. The page frames the session URL in an iframe (`sandbox="allow-scripts allow-same-origin allow-forms allow-popups"`) and relays `nerova:widget` messages. A new session is minted about a minute before `expires_at` and on `session_expired`. `COMPANION_NOT_READY` (`details.reason` / `next_step`) shows a friendly explanation; `UPSTREAM_COMPANION_ERROR` or offline shows a retry. The URL is a secret: it is never logged or shown.

## Route map

| Route | Group | Notes |
| --- | --- | --- |
| `/sign-in` | `(auth)` | custom welcome → email → code screens (`features/auth`, `useSignIn`/`useSignUp`/`useSSO`; prebuilt `AuthView` no longer used) / web `<SignIn />`; redirects to `/` if already signed in |
| `/` | `(app)` (tabs) | Today (`features/today`): today's `appointments` (business timezone), Up next hero + check-in, Later today, expected total; loading / empty / error / offline states |
| `/reports` | `(app)` | Paid plans only (`reports`): month report; opened from the centre tab button |
| `/companion` | `(app)` | Paid plans only (`companion`): companion sheet over the current screen; opened from the dome or Settings |
| `/settings/plan` | `(app)` | Plan & billing (owner only) |
| `/inbox` | `(app)` (hidden tab) | Free only; paid plans are redirected. Stub: opened from the floating Inbox dome; conversations and escalations come later |
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
| `/gallery` | `(dev)` | design system gallery (tokens, primitives, components, patterns; light/dark/both), redirects to `/` when not `__DEV__` |
| `/+not-found` | — | 404 |

`(app)/_layout.tsx` gates on `useAuth()` (redirects to `/sign-in` when signed out) **and** on having an
active `useOrganization()` — it activates the first `useOrganizationList()` membership automatically
when none is active yet, and shows `OnboardingFlow` (`features/onboarding`) when the user has none at all or the API answers
`NO_BUSINESS`. The flow stays mounted until "Go to Today", creating the Clerk org client-side and the business
via `POST /v1/onboarding`. Its generic pieces (`FlowTopBar`, `FlowFooter`, `FlowHeading`, `ChoiceCard`, `SwitchRow`) live in `@booking/ui`.

## Tooling

- `npm run lint` / `npx tsc --noEmit` / `npm run test:no-watch` must stay green. All three (plus root
  ESLint's `ignores` and root `tsconfig.json`'s `exclude`) deliberately skip `apps/api/` and `packages/database/supabase/`
  — those have their own toolchains (`docs/BUILD_PLAN.md` §2).
- `npm run export:web` / `npm run export:android` (`expo export --platform …`) are the fastest way to
  catch a bundling regression without a full EAS build.
- Tests live next to what they cover in `__tests__/` folders and use `react-test-renderer` directly
  (no `@testing-library/react-native`, to keep the dependency graph small for a scaffold this size). The app's Jest run
  also covers `packages/ui` (design system tests use `packages/ui/src/testing/render.tsx`); `apps/mobile/jest.setup.ts`
  mocks Reanimated, AsyncStorage and the lucide icons, which Jest cannot load.
- The repo is an npm workspace (`apps/mobile` and the `packages/*` libraries): run `npm install` at the root, which hoists dependencies
  to the root `node_modules`. `apps/api` keeps its own install. Root scripts: `npm run check:mobile`,
  `npm run lint -w packages/ui`, `npm run typecheck -w packages/ui`.
- `@booking/types` and `@booking/database` resolve to `packages/types/api.ts` and `packages/database/database.types.ts` (see `tsconfig.json` `paths`). They are type-only imports, erased by Babel, so Metro never resolves them. Path aliases are honoured natively
  since Expo SDK 50 added built-in `tsconfig.json`/`jsconfig.json` path-alias support, no extra Babel
  plugin required.

## Deviations from a from-scratch setup

- `ios.bundleIdentifier` and `android.package` are both the **dev placeholder** `si.nerova.booking.dev` (the app has no name yet; Clerk's
  native SDK needs *some* id registered, `docs/clerk-setup.md` §7). It must be finalised before the first Play Store / App Store release;
  see `docs/environments.md`.
- `android/` and `ios/` are not committed: they are generated by `expo prebuild` / EAS Build (CNG) and git-ignored.
- `expo-symbols`, `expo-haptics`, `expo-notifications`, `expo-device` and `expo-clipboard` are installed
  but not yet used by any screen — they back planned work (push tokens for `device_push_tokens`, haptic
  feedback, share links) rather than dead weight from the original boilerplate.
