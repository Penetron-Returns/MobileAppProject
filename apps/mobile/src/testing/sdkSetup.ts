// Import first in a suite that renders the Nerova SDK. The SDK's own setup
// mocks reanimated, gesture-handler, svg and webview, but its reanimated mock
// is minimal (no `ReduceMotion`, `withSpring`, ...) and would replace the one
// the design system needs, so the app's fuller mock is put back afterwards. It cannot be a global setupFile
// (preview.3): its react-native-svg mock has no `Line`, which breaks the
// calendar `Hatch` in screens.test.tsx.
import '@nerova/react-native/testing/jest-setup';

jest.doMock('react-native-reanimated', () =>
  jest.requireActual('./reanimatedMock'),
);
