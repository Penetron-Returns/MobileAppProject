---
description: Where code goes, the package dependency rules, how to add a feature or app-store app, and what never to do (always loaded)
---

# Repository Structure

The monorepo follows [architecture.md](/docs/architecture.md), which is binding. Apps are thin deployables, the domain lives in packages, integrations are self-contained folders, and `dependency-cruiser` ([.dependency-cruiser.cjs](/.dependency-cruiser.cjs)) fails the build when a boundary is crossed. Check placement before you write code, not after.

## Implementation

1. Place code by what it is:
   - Business rule, service, repository or pure domain logic: `packages/features/<feature>/` (`services/`, `lib/`, `ports.ts`, `README.md`)
   - HTTP route, middleware, env, `container.ts` (DI wiring), `getDb`: `apps/api/src/`. A handler parses, authorises, calls a service and shapes the response
   - Screen, navigation, per-feature UI and hooks: `apps/mobile/src/features/<feature>/`, composed from `@booking/ui`
   - Reusable visual piece: `packages/ui`
   - Wrapper around a third-party service (WhatsApp, a calendar): `packages/app-store/<app>`
   - Table, RPC, RLS policy, SQL test: `packages/database`
   - Type shared by the app and the API: `packages/types` (types only)
   - In-memory fakes and test builders: `packages/testing`
2. Obey the dependency rules. Anything else is a violation:
   - `apps/*` import packages, never other apps
   - `features` imports `types` and database types only, never `app-store`, `testing`, `ui`, `apps/*` or Hono
   - `app-store` imports `features` (ports), `types` and database types only
   - `types` imports nothing; `ui` never imports `features` or any domain package
   - `apps/mobile` never imports `apps/api` or any server package, because Metro bundles it
   - Production code never imports `packages/testing`
3. Put shared code in the lowest layer that has no forbidden dependency. If `features` and `app-store` both need it, it goes in `features`.
4. Type what a package reads from the API environment or container as a small structural interface in the package (`WhatsAppEnv`, `WaContainer`). `apps/api`'s `Env` and `Container` satisfy it. Never import them from `apps/api`.
5. To add a feature: create `packages/features/<name>/` with `ports.ts` and `services/`, add its port to the barrel [ports.ts](/packages/features/ports.ts), use or extend the shared repository interfaces, write tests in `apps/api/test`, add the route in `apps/api/src/routes`, wire it in [container.ts](/apps/api/src/container.ts), and add the DTOs to `packages/types`.
6. To add an app-store app: create `packages/app-store/<app>/` with `_metadata.ts` (an `AppManifest`), `README.md` and code behind a small capability port, add one line to [_registry.ts](/packages/app-store/_registry.ts), mount a thin route shell in `apps/api/src/routes/<app>`, and wire it in the container. Removing an app means deleting the folder and that line.
7. When you add a `@booking/*` package or path, update `apps/api/tsconfig.json` `paths`, `tsconfig.depcruise.json` and the Deno import map in `packages/database/supabase/functions/api/deno.json` together. `npm run check:imports` fails when they drift.
8. Run `npm run check:boundaries` after moving or adding imports, and the area checks from [CLAUDE.md](/.claude/CLAUDE.md) for everything you touched.
9. Never:
   - put business rules in a route handler, or HTTP, Hono or `Deno.*` code in `packages/features`
   - import across a forbidden boundary or add a lint exception to get green; change [architecture.md](/docs/architecture.md) and the rule in the same PR instead
   - write appointments from WhatsApp or app-store code; book through `BookingService`
   - create a package, folder or registry entry that [architecture.md](/docs/architecture.md) does not list without updating it first
   - re-export a fake from production code, or build a second mock of something `packages/testing` already fakes
   - give `packages/types` runtime code or dependencies

## Examples

### Example 1 - Placement

```typescript
// ✅ DO: the rule lives in features, the route only shapes HTTP
// packages/features/bookings/services/bookingService.ts
export function createBookingServiceFromRepository(deps: Deps): BookingService { … }
// apps/api/src/routes/v1/appointments.ts
v1.post('/appointments', async (c) => c.json({ data: await c.get('container').booking.createAppointment(…) }, 201));

// ❌ DON'T: availability maths and SQL in the handler, or Hono inside features
import { Hono } from 'hono'; // in packages/features/**
```

### Example 2 - Boundaries

```typescript
// ✅ DO: WhatsApp code reaches the schedule through a features port
import type { BookingService } from '@booking/features/ports.ts';

// ❌ DON'T: reach into the API shell
import { getContainer } from '../../apps/api/src/container.ts'; // in any package
```
