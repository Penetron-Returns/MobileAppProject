import * as React from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';
import Animated, {
  useAnimatedProps,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';

import { fpsLabel, framesPerSecond } from './fps';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
/** The counters are read out twice a second. */
const WINDOW_MS = 500;

/**
 * Dev-only frame counter: UI-thread frames (a Reanimated frame callback) and
 * JS-thread frames (requestAnimationFrame). Both counters only exist while
 * this is mounted, and the numbers reach the screen without a React render.
 */
export function FpsMeter() {
  const ui = useSharedValue(0);
  const js = useSharedValue(0);
  const uiFrames = useSharedValue(0);
  const uiSince = useSharedValue(0);

  useFrameCallback((frame) => {
    uiFrames.value += 1;
    const elapsed = frame.timeSincePreviousFrame ?? 0;
    uiSince.value += elapsed;
    if (uiSince.value >= WINDOW_MS) {
      ui.value = framesPerSecond(uiFrames.value, uiSince.value);
      uiFrames.value = 0;
      uiSince.value = 0;
    }
  });

  React.useEffect(() => {
    let frames = 0;
    let since = Date.now();
    let id = 0;
    const tick = () => {
      frames += 1;
      const now = Date.now();
      if (now - since >= WINDOW_MS) {
        js.value = framesPerSecond(frames, now - since);
        frames = 0;
        since = now;
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [js]);

  const label = useDerivedValue(() => fpsLabel(ui.value, js.value));
  const animatedProps = useAnimatedProps(
    () => ({ text: label.value }) as Partial<TextInputProps>,
  );
  return (
    <AnimatedTextInput
      editable={false}
      pointerEvents="none"
      defaultValue={fpsLabel(0, 0)}
      animatedProps={animatedProps}
      style={styles.meter}
    />
  );
}

const styles = StyleSheet.create({
  meter: {
    position: 'absolute',
    top: 54,
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.72)',
    color: '#7CFFB2',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
