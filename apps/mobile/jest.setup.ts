// Reanimated needs its native worklets runtime, which Jest does not have, and
// its own mock loads the real module. The design system's overlays and toasts
// import it (and so does the `@booking/ui` barrel), so every suite gets this
// minimal stand-in: animated components are plain views and layout animations
// are no-ops.
jest.mock('react-native-reanimated', () =>
  require('./src/testing/reanimatedMock'),
);

// AsyncStorage has no native module under Jest: use the package's own mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// lucide-react-native ships ESM that Jest does not transform. Every icon
// renders as a plain view; tests care about labels, not glyphs.
jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

// The swipeable row needs the native gesture handler. Under Jest it is a plain
// view that renders the row and its trailing actions side by side, so tests
// can find and press the actions; the real swipe is a device concern.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () =>
  require('./jest.swipeable-mock'),
);

// Text-to-speech is native: tests only need to see that it was asked to speak.
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(() => Promise.resolve()),
}));
