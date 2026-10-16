// Reanimated needs its native worklets runtime, which Jest does not have, and
// its own mock loads the real module. The design system's overlays and toasts
// import it (and so does the `@booking/ui` barrel), so every suite gets this
// minimal stand-in: animated components are plain views and layout animations
// are no-ops.
function createReanimatedMock() {
  const { View } = require('react-native');
  const noop: unknown = new Proxy(function () {}, {
    get: () => noop,
    apply: () => noop,
  });
  const mock = {
    __esModule: true,
    default: { View, createAnimatedComponent: (c: unknown) => c },
    ReduceMotion: { System: 'system', Never: 'never', Always: 'always' },
    LayoutAnimationConfig: ({ children }: { children?: unknown }) => children,
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    useSharedValue: (value: unknown) => ({ value }),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    useAnimatedStyle: (fn: () => unknown) => fn(),
    withTiming: (value: unknown) => value,
    withSpring: (value: unknown) => value,
    interpolate: (value: number) => value,
    runOnJS: (fn: unknown) => fn,
  } as Record<string | symbol, unknown>;
  return new Proxy(mock, {
    get: (target, key) => (key in target ? target[key] : noop),
  });
}

module.exports = createReanimatedMock();
