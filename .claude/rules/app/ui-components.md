---
paths:
  - "src/components/**/*.tsx"
  - "global.css"
  - "tailwind.config.*"
  - "components.json"
---

# UI component library (react-native-reusables / shadcn for RN)

- Build screens from `src/components/ui/*` primitives and `src/components/*` composites. Don't restyle raw `View`/`Text` when a primitive exists.
- Add primitives through the shadcn CLI/MCP against the RNR registry (`components.json`), then adapt. Keep them close to upstream so updates stay easy.
- Styling: NativeWind `className` only, with design tokens (`bg-primary`, `text-muted-foreground`, `border-border` …). **No hex colours, no inline style objects** except for computed layout values.
- Variants via `cva`, class merging via `cn()`. Every component accepts and forwards `className`.
- Props: typed, minimal (interface segregation), controlled where it matters, sensible defaults. No boolean-flag soup: several mutually exclusive booleans mean it should be a `variant`.
- Accessibility: `accessibilityRole`/`accessibilityLabel`, 44pt minimum touch targets, visible focus on web, sufficient contrast in both themes.
- Every new component or variant is added to the dev gallery (`src/app/(dev)/gallery.tsx`) and gets a render test.
