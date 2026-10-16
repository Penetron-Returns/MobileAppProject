// Import first in a suite that renders the Nerova SDK. The SDK's own setup
// mocks reanimated, gesture-handler, svg and webview, but its reanimated mock
// is minimal (no `ReduceMotion`, `withSpring`, ...) and would replace the one
// the design system needs, so the app's fuller mock is put back afterwards.
import '@nerova/react-native/testing/jest-setup';

jest.doMock('react-native-reanimated', () =>
  jest.requireActual('./reanimatedMock'),
);
