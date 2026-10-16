// Runs after `@nerova/react-native/testing/jest-setup` (see jest.setupFiles).
// The SDK's reanimated mock replaces ours and breaks the design-system
// gallery's base section ("Cannot convert object to primitive value"), so the
// app's fuller mock is put back.
jest.doMock('react-native-reanimated', () =>
  require('./src/testing/reanimatedMock'),
);
