# @booking/app-store

Optional integrations, one folder each, installed per business. An app implements small capability ports from
`@booking/features` (messaging, calendar, payments), never owns core data and stores credentials encrypted.
It depends only on `@booking/features`, `@booking/types` and database types.

- `types.ts`: `AppManifest` (id, name, kind, required plan feature)
- `_registry.ts`: the hand-written list of apps (`APPS`, `listApps()`)
- `<app>/_metadata.ts`: that app's manifest
- `whatsapp/`: the WhatsApp Free demo

## Add an app

1. Create `packages/app-store/<app>/` with `_metadata.ts` (an `AppManifest`), `README.md` and the code.
2. Add one line to `_registry.ts`.
3. Mount its HTTP routes as a thin shell in `apps/api/src/routes/<app>` and wire it in `apps/api/src/container.ts`.
4. Gate on `requiredFeature`, on the plan and never on "installed".

Removing an app is deleting its folder, its registry line and its route shell.
