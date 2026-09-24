---
paths:
  - "src/**/*.{ts,tsx}"
  - "app.json"
  - "eas.json"
---

# Expo app

- Structure: `src/app/` holds routes only (thin, composing features). `src/features/<feature>/` holds hooks, components and pure logic for that feature. `src/components/ui/` is the design-system primitives. `src/components/` holds app-level composites. `src/lib/` holds clients and utilities.
- Screens don't talk to `supabase` or `api` directly. They use feature hooks (TanStack Query for reads, mutations via `src/lib/api.ts`). Query keys live in one place per feature.
- Reads go through Supabase with RLS. Writes go through the backend API with an `Idempotency-Key` per user action (reused on retry).
- Realtime subscriptions invalidate queries. They never patch state ad hoc.
- Auth is Clerk's prebuilt UI only (`AuthView`, `UserButton`, `UserProfileView`, web `SignIn`). Don't build custom auth forms.
- Show business-timezone times and format money from integer cents with the shared formatters. Never format inline.
- All user-facing strings go through i18n (`en-US.json`).
- Every screen handles loading, empty and error states (`LoadingState`, `EmptyState`, `ErrorState` with `request_id`), safe areas and keyboard avoidance, and works in dark mode.
- Only use `npx expo install` for Expo-managed packages. Native modules need a dev build, not Expo Go.
- Default exports only for Expo Router route files. Named exports everywhere else.
