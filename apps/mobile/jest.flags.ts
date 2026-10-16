// Runs before `@nerova/react-native/testing/jest-setup` (see jest.setupFiles).
// Keeps the app's own reanimated mock (`jest.setup.ts`) instead of the SDK's,
// which breaks the design-system gallery's base section.
(globalThis as Record<string, unknown>).__NEROVA_SKIP_REANIMATED_MOCK__ = true;
