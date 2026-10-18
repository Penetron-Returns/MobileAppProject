# Vendored Nerova SDK

`@nerova/react-native` is not on a public registry yet, so the preview tarball is committed here and
`package.json` points at it (`file:./vendor/...`). EAS cloud builds cannot read files outside the repo.

To update to a newer preview from Nerova:

1. Copy the new `nerova-react-native-<version>.tgz` into this folder and delete the old one.
2. Change the `@nerova/react-native` path in `apps/mobile/package.json`.
3. From the repo root run `npm install` (updates `package-lock.json`).
4. In `apps/mobile` run `npx tsc --noEmit` and `npm run test:no-watch`, then commit the tarball, `package.json` and lockfile together.
