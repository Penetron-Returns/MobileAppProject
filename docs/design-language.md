# Design language: SwiftUI fidelity + Depth

Status: **binding for all UI work** (agreed with the founder, 15 Oct 2026). Tokens and components live in [design-system.md](design-system.md); this document says what they must add up to.

## The idea

The app should look and feel like a first-party SwiftUI app, without being written in SwiftUI. It is built in React Native for iOS and Android. On top of that native feel sits our own **Depth** layer: soft raised surfaces, inset fields, engraved separators and glossy domes. Together they make "Apple luxury", a product that feels expensive, calm and immediate, so owners enjoy opening it every day.

Three rules decide every disagreement:

1. **Behaviour comes from SwiftUI.** This covers navigation, sheets, controls, gestures, motion and haptics. They behave the way an iPhone user already knows.
2. **Geometry and colour come from the boards.** The design canvas is the visual spec (sizes, radii, spacing, depth tokens). Where a board and stock SwiftUI differ, the board wins; where a board is silent, use the SwiftUI default.
3. **Depth decorates, it never changes behaviour.** Depth adds light and material; it never changes a control's size, layout or interaction.

The same idiom ships on Android. The app looks like an iPhone app there too, including chevron back pills, sheets with grabbers and iOS switches. Android keeps only what the platform requires: the system back gesture and button, the status bar and navigation bar insets, and its own text rendering.

## Typography (SwiftUI text styles)

Use the SwiftUI Dynamic Type styles at the default ("Large") size. Never set ad-hoc font sizes; use the type scale tokens, which map one-to-one:

| Style | Size / line | Weight | Tracking | Typical use |
| --- | --- | --- | --- | --- |
| `largeTitle` | 34 / 41 | Bold (nav large title) | +0.40 | Screen titles (Today, Settings) |
| `title1` | 28 / 34 | Bold | +0.38 | Hero numbers, onboarding |
| `title2` | 22 / 28 | Bold | −0.26 | Section titles ("Your business") |
| `title3` | 20 / 25 | Semibold | −0.45 | Profile names, card titles |
| `headline` | 17 / 22 | Semibold | −0.43 | Row emphasis, nav inline title |
| `body` | 17 / 22 | Regular | −0.43 | Rows, inputs, buttons |
| `callout` | 16 / 21 | Regular | −0.31 | Secondary actions |
| `subheadline` | 15 / 20 | Regular | −0.23 | Row subtitles, hints |
| `footnote` | 13 / 18 | Regular | −0.08 | Footers, legal, timestamps |
| `caption1` | 12 / 16 | Regular | 0 | Badges, chart labels |
| `caption2` | 11 / 13 | Regular | +0.06 | Tab bar labels |

- **Fonts:**
  - **iOS** uses the system font (SF Pro). Never bundle SF Pro: Apple's licence limits it to Apple platforms.
  - **Android** uses **Inter** with the tracking above, which is the closest licensable match to SF. Weights: 400, 500, 600, 700.
  - Numbers in times, prices and counters use tabular figures.
- **Dynamic Type:** text scales with the system setting. Containers grow with their text; never give a text container a fixed height. Check every screen at the largest accessibility size.
- **Hierarchy:** use weight and colour (`label` vs `secondaryLabel`), not more sizes. A screen uses at most three text styles plus its title.

## Colour and materials

- **System semantic roles** are the base: `label`, `secondaryLabel` (60%), `tertiaryLabel` (30%), `separator`, `systemGroupedBackground`, `secondarySystemGroupedBackground`, and `tint` = system blue (the only interactive colour). System red is for destructive actions, system green for on and success, system orange for warnings. Light and dark values come from `tokens/colors.ts` and `tokens/depth.ts`.
- **Depth tokens** layer on these: `ground` gradient, `raised` card gradient with the raised shadow stack, `inset` fields, `engrave` separators, `dome` highlight, and the tint-gradient primary.
- **Materials:** bars, the tab bar and sheets read as SwiftUI materials (`.ultraThinMaterial` / `.regularMaterial`, iOS 26 "Liquid Glass"). On iOS, use a real blur (`expo-blur`). On Android, use the matching translucent gradient with the `navFade` token, because a blur behind scrolling content is unreliable there.
- **Contrast:** at least 4.5:1 for text and 3:1 for controls, in both themes.

## Layout

- **Lists** follow SwiftUI `List` with `.insetGrouped`:
  - section title above (`title2` in our boards), footer text below (`subheadline`, secondary)
  - rows at least 56pt tall (the board value; SwiftUI's own minimum is 44pt)
  - leading icon 20pt, chevron 14pt for navigation rows
  - engraved separators inset to the text start
- **Margins:** 20pt screen margins; 16pt card padding; 26pt card radius (or 22 for dense lists, per the board).
- **Touch targets:** 44×44pt minimum, everywhere, including small chips and icons (use `hitSlop`).
- **Safe areas:** content respects all insets. The floating tab bar and the Inbox dome reserve their clearance.

## Navigation (SwiftUI `NavigationStack`)

- **Large titles:**
  - The large title sits at the top of the scroll content.
  - **When scrolled, it collapses into an inline 17pt semibold title** in a material bar. That bar fades in as the large title passes under it, as in SwiftUI's `.navigationBarTitleDisplayMode(.large)`.
  - Detail screens use inline titles.
- **Push:** slides from the right, with interactive swipe-back from the left edge. The back control is a chevron plus the previous screen's title (our glass BackPill).
- **Tabs:** a floating tab bar with a sliding selection. Tabs keep their own navigation stack and scroll position. Tapping the active tab scrolls to the top and pops to root, as in SwiftUI.
- **Modals:** creation flows (New booking) present as a full sheet that slides up and closes with a circular ✕ (iOS 26 style). Confirmation-type sheets use a ✓ or a text "Done". Dismissing with unsaved input asks first.

## Sheets (SwiftUI `.sheet` + `.presentationDetents`)

- **Sheet sizes:** pick from `.medium` (about half), `.large` (full height), or a fitted height.
- Every sheet shows a grabber and can be dismissed by dragging down, unless it holds unsaved input.
- **Background:** the presenting screen scales down slightly behind a large sheet (our `Presenter`) and dims behind a medium one.
- **Corners:** large, continuous ("squircle") corners at the top.
- **Toolbar:** Cancel / ✕ on the left, the title in the centre, and the primary action (Save / ✓) on the right or pinned at the bottom (our `FormSheet`).

## Controls (SwiftUI equivalents)

| SwiftUI | Ours | Notes |
| --- | --- | --- |
| `Toggle` | `Switch` | 51×31 track, 27pt thumb, spring slide, green on |
| `Picker(.segmented)` | `SegmentedControl` | Sliding selection pill |
| `Picker(.menu)` | `Menu` / OptionSheet | Pull-down menu anchored to the control |
| `Picker(.wheel)`, `DatePicker(.wheel)` | `TimeWheel` | Inline wheel inside the row |
| `DatePicker(.graphical)` | `MonthGrid` | Calendar grid in a sheet |
| `Stepper` | `Stepper` | − / + capsule |
| `Button(.borderedProminent)` | `Button` primary | Capsule, tint gradient (Depth) |
| `Button(.bordered)` / `.plain` | `Button` secondary / `TintLink` | |
| `Button(role: .destructive)` | destructive variants | System red, always confirmed |
| `.confirmationDialog` | action sheet | Choices for one item (bottom on iPhone) |
| `.alert` | `ConfirmDialog` | Critical, blocking decisions only |
| `.swipeActions` | row swipe | Trailing red Delete / Cancel; leading for quick actions |
| `.contextMenu` | long-press menu | Preview plus actions on rows and calendar blocks |
| `.searchable` | `SearchField` | Collapses with the title; Cancel clears it |
| `.refreshable` | pull to refresh | Native control, haptic on release |
| `ContentUnavailableView` | `EmptyState` | Symbol, title, one line, one action |
| `ProgressView` | skeletons | Skeletons for content, spinners only for short actions |

## Motion (SwiftUI springs)

Animations use spring physics like SwiftUI's, defined once in `tokens/motion.ts`. They map to Reanimated as `withSpring({ duration, dampingRatio })`, where `dampingRatio = 1 − bounce`:

| SwiftUI | Duration | Bounce | Use |
| --- | --- | --- | --- |
| `.smooth` | 0.5s | 0 | Layout changes, sheets, page-level |
| `.snappy` | 0.5s | 0.15 | Selection pills, toggles, chips |
| `.bouncy` | 0.5s | 0.3 | Celebratory moments only (success, first booking) |
| press | 120ms ease | n/a | Press-down scale (0.97) and inset shadow |

- **Pages and sheets:** native transitions (push about 350ms, sheet slide-up).
- **Hero moments:** where a row opens into its detail (booking, client), aim for SwiftUI's zoom-style transition. Use a shared element, or a scale-and-fade from the tapped row.
- **Symbols:** icons react the way SF Symbol effects do: a bounce on tap for tab icons and confirmations, and a replace effect when an icon changes state.
- **Lists:** rows appear with a short staggered fade-up on first load only. Insertions and removals animate layout (Reanimated layout animations).
- **Reduced motion:** every animation honours it. Springs become cross-fades or are dropped, and nothing depends on motion to be understood.
- **Never block input:** animations run on the UI thread and never delay a tap, navigation or save.

## Haptics (SwiftUI `.sensoryFeedback`)

| Moment | Feedback (`expo-haptics`) |
| --- | --- |
| Tab change, segmented change, picker or wheel tick | `selectionAsync` |
| Toggle, chip select, press on a primary control | `impactAsync(Light)` |
| Save succeeded, booking created | `notificationAsync(Success)` |
| Validation blocked, slot just taken | `notificationAsync(Warning)` |
| Failure | `notificationAsync(Error)` |

Haptics confirm; they never replace visible feedback. Use them sparingly: one per user action.

## Icons

- **iOS:** SF Symbols (`expo-symbols`), in the weight that matches the adjacent text.
- **Android:** the matching Lucide glyph, with stroke weight tuned to the text weight (our `GLYPHS` set reproduces the boards' paths).
- **Sizes:** 20pt in rows, 22–26pt in the tab bar, 14pt chevrons.
- **Placement:** icons label and never decorate; every icon-only button has an accessible label.

## Depth: the luxury layer

Depth is what makes this "Apple, but ours". It is subtle, consistent and only from tokens:

- **Raised:** cards and grouped lists sit on the ground with a soft layered shadow and a top highlight.
- **Inset:** inputs, time fields, steppers and the selected-segment track are pressed into the surface.
- **Engraved:** separators are a dark line over a light line.
- **Domes:** avatars and round buttons (bell, Inbox, ✕) carry a radial highlight.
- **Tint gradient:** primary buttons and the selected tab use the tint gradient with a coloured shadow.
- **Pressed:** pressable surfaces sink (inset shadow plus a 0.97 scale) for 120ms.

**Limits:**
- one raised level per screen region; never stack raised on raised
- no depth on text
- no hand-rolled shadows or hex colours
- identical metrics in light and dark

## Apple luxury: the quality bar

Every screen must pass this list before it is "done":

1. **It feels native in the hand.** Swipe-back works, the title collapses, sheets drag, controls spring, and haptics land.
2. **It is calm.** There is one primary action, generous spacing, few words and no clutter. There is never more than one tint-coloured call to action in view.
3. **It is immediate.** Skeletons replace spinners, saves feel instant (optimistic where safe), and errors explain and recover.
4. **It is consistent.** It uses only `@booking/ui` components and tokens, and matches the board element by element.
5. **It is inclusive.** It works with Dynamic Type at maximum size, VoiceOver/TalkBack, reduced motion and both themes.
6. **It has one moment of delight** where it earns it: a success check after a save, the first booking of the day, a filled gap.

## Implementation status

What `@booking/ui` already covers, and what is still needed to reach full SwiftUI fidelity. This list is the roadmap; tick items off here when they land.

| Area | Status |
| --- | --- |
| Type scale, colour roles, Depth tokens | Done |
| Grouped lists, rows, engraved separators, switches, segmented control, stepper, time wheel, month grid | Done |
| Push slide + swipe-back, tab cross-fade, sliding tab pill, press scale, spring switch, chevron turns, list reveal | Done (motion pass) |
| New booking as slide-up modal with ✕ | Built and merged; not yet verified on a device |
| **Large title → inline title collapse on scroll** (material bar fade) | Done for `Page` screens (Today, Clients, Settings, pushed pages): UI-thread scroll handler, blur bar on iOS, opaque ground material on Android, overscroll stretch, instant under reduced motion. `GlassPage` (centred title, no large title) and Calendar (fixed header) are unchanged |
| **Spring tokens mapped to SwiftUI `.smooth` / `.snappy` / `.bouncy`** | Done: `SPRING` is `{ duration: 500, dampingRatio }` (1 / 0.85 / 0.7); `bouncy` only for `SuccessMark` |
| **Haptics map** (selection / light impact / success / warning / error) | Done: `haptics` helper in `@booking/ui` (no-op on web, never throws). Selection: tabs, segmented, wheel, month grid, day pick. Light: switch, chip, primary button, Add. Success: `SuccessMark` and success toasts. Warning: blocked input (`toast.blocked`), slot taken. Error: error toasts |
| **Swipe actions on rows** (bookings, clients, services, team) | To do |
| **Context menus** (long-press preview + actions) on rows and calendar blocks | To do |
| **Sheet detents** (medium/large) for pickers and quick actions | To do |
| **Pull-down menus** (`Picker(.menu)`) for overflow actions | To do |
| **SF Symbols on iOS** (`expo-symbols`) with Lucide on Android | To do |
| **Inter on Android** with SF tracking; system font on iOS | To do: check the current font setup |
| **Zoom-style hero transition** row → detail | To do |
| **Material blur on iOS bars and sheets** | Partial (BackPill, sheet footer) |
| **Dynamic Type at maximum size**, VoiceOver/TalkBack audit | To do |
