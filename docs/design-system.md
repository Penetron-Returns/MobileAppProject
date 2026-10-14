# Design system (`@booking/ui`)

One shared package holds every token, primitive, component and pattern the app is built from. Screens
compose it; they do not restyle it. It lives in `packages/ui` and the Expo app imports it by name:

```tsx
import { Button, Page, Surface, Text, useDepth } from '@booking/ui';
```

The visual language is the approved iPhone design (Foundations, `SOFT.md`, `DEPTH.md` on the design canvas):
soft, quiet colour, bigger fewer words, layered depth (shadows and gradients), iOS system blue as the only
interactive colour. Android is first on device, so check every change there too.

## How it is wired

| Concern | Where |
| --- | --- |
| Package | `packages/ui` (`@booking/ui`, private, source only: `main` is `src/index.ts`, no build step) |
| Install | npm workspaces at the repo root (`apps/mobile`, `packages/ui`); `npm install` at the root links it. `packages/shared` stays types-only and is **not** a workspace |
| Metro | `apps/mobile/metro.config.cjs` watches `packages/ui` and resolves from the hoisted root `node_modules` |
| Babel/NativeWind | the app's `babel.config.cjs` compiles the package; `tailwind.config.cjs` scans `packages/ui/src/**` and loads `packages/ui/tailwind-preset.cjs` (colour roles, type scale, radii) |
| CSS variables | `apps/mobile/global.css` declares the HSL variables; a test keeps it equal to `tokens/colors.ts` |
| TypeScript | `apps/mobile/tsconfig.json` maps `@booking/ui` to `packages/ui/src/index.ts` (and `@booking/ui/*` to its folders, for the shadcn CLI and `jest.mock` only: app code may not import those); `packages/ui/tsconfig.json` type-checks the package alone |
| Jest | `apps/mobile/package.json` runs tests from both `src/` and `packages/ui/` (`roots`), maps `@booking/ui`, and mocks Reanimated and AsyncStorage in `apps/mobile/jest.setup.ts` |
| Lint | `npm run lint -w packages/ui` (same rules as the app, plus: the package never imports the app) |

The package has **peer dependencies only** (React Native, NativeWind, Reanimated, `expo-router`,
`react-i18next`, `react-hook-form`, `lucide-react-native` and friends). The app owns their versions.

## Layout

```
packages/ui/
  tailwind-preset.cjs        colour roles, type scale, radii, animations for Tailwind
  src/
    index.ts                 the barrel: the ONLY public surface
    tokens/                  colors, depth, typography, spacing, radii, motion, zIndex
    theme/                   useDepth, useAppColorScheme, SchemeScope (force light/dark on a subtree)
    lib/                     cn (tailwind-merge that knows the type scale), initials, strings, interop
    primitives/              Text, Surface, Ground, Pressable, Divider, Icon, Skeleton
    components/              Button, IconButton, Switch, SwitchRow, SegmentedControl, Chip(s), Capsule, Avatar,
                             IconDome, Group/GroupRow/SectionTitle, GroupField, FormField, InsetInput,
                             SearchField, Sheet, OptionSheet, ConfirmDialog, Toaster (+ toast store),
                             slot picker kit (DayChips, TimeChips, SlotSkeleton), DoneCard, ChoiceCard, ...
    patterns/                Page, Screen, StackHeader, BackPill, Flow* (top bar, footer, heading),
                             SaveFooter, states (ErrorState, EmptyState, OfflineBanner, skeletons,
                             BlockedActionSheet), tab-bar (FloatingTabBar, InboxDome)
    rnr/                     the react-native-reusables (shadcn for RN) base, kept close to upstream
    testing/                 render helpers for the package's own tests (not exported)
```

Rules of the layers: tokens know nothing; primitives use tokens; components use primitives; patterns use
components. Nothing in the package imports the app (`@/…`), and the app imports nothing but `@booking/ui`
(ESLint `no-restricted-imports` enforces both, and also blocks the old `@/components/...` paths).

## Tokens

- **Colour roles** (`tokens/colors.ts`): light and dark HSL channels per role (`background`, `primary`,
  `statusConfirmed`, ...). `global.css` carries the same values as CSS variables for NativeWind classes
  (`bg-card`, `text-muted-foreground`). `THEME` gives raw `hsl()` strings for places classes cannot reach.
  `colors.test.ts` fails when `global.css`, the preset and the table drift apart.
- **Depth** (`tokens/depth.ts`): `getDepth(scheme, tint)` returns the approved layered shadows and gradients
  (`ground`, `raised`, `hero`, `floating`, `button`, `knob`, `primary`, `inset`, `dome`, `engrave`, `bar`,
  `pill`, `badge`, status `capsule` colours) from `Main.dc.html`. Use them through `useDepth()`, `Surface`
  and `Ground`. Never hand-roll a shadow.
- **Type scale** (`tokens/typography.ts`, mirrored as `text-*` classes): large title 34/41, section 22/28,
  title 17/22, subtitle 15/20, meta 13/18, button 17/22 semibold. Nothing a person must read is under 15px.
- **Spacing** (4/8 grid), **radii**, **motion** durations and **z-index** are tables in `tokens/`; use the
  table, not a literal.

## Use it

- Style with `className` and tokens. The `style` prop is for computed values and depth tokens.
- Take the smallest props that render the thing. Several mutually exclusive booleans mean a `variant`
  (`ErrorState variant="banner|card|screen"`, `Chip variant="filter|time"`, `SwitchRow variant="flat|card"`).
- Domain logic stays out: components take already formatted strings and callbacks. `SlotPicker` pieces take
  `{ value, label }` lists; `ErrorState` takes `message` and `requestId`, not an API error. The app has thin
  adapters (`describeError(error)` in `lib/toast.ts`, `SlotPicker` in `features/bookings`).
- Strings: the package owns only accessibility labels and the fixed state screens (`lib/strings.ts`,
  `DS_STRINGS`). They read the host's i18n keys and fall back to English; `src/lib/__tests__/ds-strings.test.ts`
  keeps `en-US.json` equal to the defaults. Everything else arrives as props.

## Accessibility rules

Every component has to meet these; the render tests check them.

1. **Labels.** Every pressable has an accessible name (`accessibilityLabel`, or visible text that is the name).
   Icon-only controls require a `label` prop (`IconButton`), switches require `accessibilityLabel`, inputs
   take `label`. Give each a role (`button`, `switch`, `radio`, `tab`, `progressbar`, `alert`, `heading`).
2. **State.** Expose `selected`, `checked`, `disabled` and `busy` through `accessibilityState`.
3. **44pt targets.** Anything tappable is at least 44pt in both directions: use `min-h-11`, or a smaller
   visible shape with `hitSlop` that reaches 44 (`IconButton size="sm"`).
4. **Font scaling.** Text scales with the system font size: never put a fixed height on a text container,
   use `min-h-*`, and keep line height in the type scale.
5. **Reduced motion.** Animations use `ReduceMotion.System` (see `Sheet`); durations come from `tokens/motion`.
6. **Contrast and colour.** Secondary text is the 72% label colour, never lower. Colour alone never carries
   meaning: status capsules carry words, selection also changes weight or shape.
7. **Live regions.** Errors and results announce themselves (`accessibilityRole="alert"`,
   `accessibilityLiveRegion`).
8. **Decoration is hidden.** Avatars and illustration domes are hidden from screen readers; the name beside
   them is the content.

## Add a component

1. Pick the layer (primitive, component, pattern). Search the package first: extend or add a `variant` before
   adding a component.
2. Write it in `packages/ui/src/<layer>/Name.tsx`: named export, typed props (export the props type),
   `className` forwarded through `cn()`, `cva` for variants, relative imports only. Use tokens, never hex.
3. Export it (and its types) from `src/index.ts`. Alphabetical inside its group.
4. Test it in the nearest `__tests__/` with the helpers in `src/testing/render.tsx`: one case per variant and
   state, the accessibility rules above, and light plus dark where colour changes.
5. Add it to the gallery (`apps/mobile/src/features/gallery/*`, route `apps/mobile/src/app/(dev)/gallery.tsx`)
   in every variant and state. The gallery shows light, dark or both at once (`SchemeScope`).
6. Use it in the app and delete anything it replaces. One implementation per concept.

New react-native-reusables primitives: `npx shadcn@latest add <name>` (aliases in `apps/mobile/components.json`
write into `packages/ui/src/rnr/`), then fix the generated imports to be relative, export it from the barrel and
add it to the gallery's Base section. If a design-system component replaces one, delete the upstream file.

## Gallery

`/gallery` (dev builds only) renders every token, primitive, component and pattern in all variants and states.
Layers are tabs; the theme control shows Light, Dark or Both stacked. `SchemeScope` forces the scheme for a
subtree (CSS variables and depth tokens), so both can be compared on one screen.

## Known gaps

- `Screen` plus `StackHeader` (the classic shell) still power the booking detail, cancel, reschedule and new
  booking screens until they are restyled to the depth `Page`.
- The tab bar has no backdrop blur: it is 94% opaque as in the design; domes use a linear highlight.
- There is no `@testing-library/react-native` in the repo; tests use `react-test-renderer` through
  `src/testing/render.tsx`.
