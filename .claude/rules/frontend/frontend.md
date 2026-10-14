---
paths: apps/mobile/src/**/*.ts,apps/mobile/src/**/*.tsx,packages/ui/**,apps/mobile/app.json,apps/mobile/eas.json,apps/mobile/babel.config.cjs,apps/mobile/metro.config.cjs,apps/mobile/tailwind.config.cjs,apps/mobile/global.css
description: Core rules for the Expo / React Native app (structure, routing, state, platform)
---

# Frontend

Guidelines for the owner/staff Expo app: folder structure, routing, state ownership and the platform setup. Topic rules in this folder cover UI components, data fetching, auth, forms and translations.

## Implementation

1. Follow the folder structure:
   - `apps/mobile/src/app/`: Expo Router route files only. Thin: compose feature components, no data logic
   - `apps/mobile/src/features/<feature>/`: `hooks.ts` (queries/mutations), `components/`, pure logic (`*.ts`) with tests
   - `packages/ui/` (`@booking/ui`): the design system: tokens, primitives, components and patterns, imported from the package entry point only (see [docs/design-system.md](/docs/design-system.md))
   - `apps/mobile/src/components/`: app-only pieces (auth token bridge, Clerk button, theme provider, config error screen). Shared UI goes in the design system, not here
   - `apps/mobile/src/lib/`: clients (`supabase`, `api`, `query`), `env`, formatters, `utils`
2. Use default exports only in Expo Router route files. Use named exports everywhere else.
3. Keep server state in TanStack Query only. Keep local UI state in components. Never mirror server data in React context or global stores.
4. Put business-independent pure logic (calendar layout, slot grouping, formatting) in plain functions with unit tests, not inside components.
5. Show times in the business timezone and money from integer cents via the shared formatters in `apps/mobile/src/lib/`. Never format inline.
6. Handle loading, empty and error states on every screen (`LoadingState`, `EmptyState`, `ErrorState` with `request_id`), plus safe areas, keyboard avoidance and dark mode.
7. Run on dev builds (`cd apps/mobile && npx expo start --dev-client`). Clerk native components don't work in Expo Go. Add Expo-managed packages with `npx expo install`.
8. Run `cd apps/mobile && npm run lint && npx tsc --noEmit && npm run test:no-watch` before calling frontend work done.

## Examples

### Example 1 - Thin Route File

```tsx
// ✅ DO: the route composes a feature
export default function ClientsRoute() {
  return <ClientsScreen />;
}

// ❌ DON'T: fetch and transform data inside the route file
export default function ClientsRoute() {
  const [rows, setRows] = useState([]);
  useEffect(() => { supabase.from('clients').select('*').then(…) }, []);
  …
}
```

### Example 2 - Formatting

```tsx
// ✅ DO
<Text>{formatMoney(service.price_cents, business.currency)}</Text>

// ❌ DON'T
<Text>R{(service.price_cents / 100).toFixed(2)}</Text>
```
