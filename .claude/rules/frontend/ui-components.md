---
paths: packages/ui/**,apps/mobile/src/components/**/*.tsx,apps/mobile/src/features/gallery/**,apps/mobile/global.css,apps/mobile/tailwind.config.cjs,apps/mobile/components.json
description: Rules for the react-native-reusables (shadcn for RN) component library, tokens and styling
---

# UI Components

The design system is the `@booking/ui` workspace package (`packages/ui`): tokens, primitives, components and patterns on NativeWind, with react-native-reusables (shadcn for React Native) as its base. Screens are built only from it, so the app stays visually consistent in light and dark mode. Structure, tokens, accessibility rules and the add-a-component steps are in [docs/design-system.md](/docs/design-system.md).

## Implementation

1. Import UI from `@booking/ui` only. ESLint blocks the old `@/components/...` paths and deep package imports. Add RNR primitives with the shadcn CLI or MCP against `apps/mobile/components.json` (they land in `packages/ui/src/rnr/`), never by copying from elsewhere. Keep them close to upstream and record deliberate divergences in `docs/mobile-app.md`.
2. Style with NativeWind `className` and design tokens only (`bg-primary`, `text-muted-foreground`, `border-border` …). No hex colours, no inline `style` objects except computed layout values.
3. Define variants with `cva` and merge classes with `cn()`. Every component accepts and forwards `className`.
4. Keep props typed and minimal. Use a `variant` or `size` instead of several mutually exclusive booleans. Split a component when it serves two jobs. One implementation per concept: extend or add a variant before adding a component, and delete what it replaces. Components take formatted strings and callbacks, never API types.
5. Build in accessibility: `accessibilityRole`, `accessibilityLabel`, 44pt minimum touch targets, text that scales with the system font size (no fixed heights on text), `ReduceMotion.System` on animations, visible focus on web, and contrast in both themes.
6. Export every new component from `packages/ui/src/index.ts`, add it in every variant and state to the dev gallery (`apps/mobile/src/features/gallery/`, route `apps/mobile/src/app/(dev)/gallery.tsx`) and give it a render test in `packages/ui` (`src/testing/render.tsx`).
7. Use the `ui-ux-pro-max`, `composition-patterns` and `react-native-skills` skills for design and API decisions.

## Examples

### Example 1 - Tokens

```tsx
// ✅ DO
<View className="rounded-xl border border-border bg-card p-4" />

// ❌ DON'T
<View style={{ borderRadius: 12, borderColor: '#E5E7EB', backgroundColor: '#fff', padding: 16 }} />
```

### Example 2 - Variants

```tsx
// ✅ DO
<StatusBadge status="no_show" />
<Button variant="destructive" size="sm" />

// ❌ DON'T
<Badge isRed isSmall isOutlined />
```
