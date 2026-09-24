---
paths: apps/mobile/src/components/**/*.tsx,apps/mobile/global.css,apps/mobile/tailwind.config.cjs,apps/mobile/components.json
description: Rules for the react-native-reusables (shadcn for RN) component library, tokens and styling
---

# UI Components

The design system is react-native-reusables (shadcn for React Native) on NativeWind. Screens are built from these primitives and a small set of app composites, so the app stays visually consistent in light and dark mode.

## Implementation

1. Add primitives with the shadcn CLI or MCP against the RNR registry in `apps/mobile/components.json`, never by copying from elsewhere. Keep them close to upstream and record deliberate divergences in `docs/mobile-app.md`.
2. Style with NativeWind `className` and design tokens only (`bg-primary`, `text-muted-foreground`, `border-border` …). No hex colours, no inline `style` objects except computed layout values.
3. Define variants with `cva` and merge classes with `cn()`. Every component accepts and forwards `className`.
4. Keep props typed and minimal. Use a `variant` or `size` instead of several mutually exclusive booleans. Split a component when it serves two jobs.
5. Build in accessibility: `accessibilityRole`, `accessibilityLabel`, 44pt minimum touch targets, visible focus on web, and contrast in both themes.
6. Add every new component or variant to the dev gallery (`apps/mobile/src/app/(dev)/gallery.tsx`) and give it a render test.
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
