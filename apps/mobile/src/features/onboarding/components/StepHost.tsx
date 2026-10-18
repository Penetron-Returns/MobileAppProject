import * as React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { type SharedValue } from 'react-native-reanimated';
import { useReduceMotion } from '@booking/ui';

import { stepEntering, stepExiting, stepMotion } from '../motion';

/**
 * The content area of the persistent chrome: the step under `stepKey` pushes in
 * while the previous one pushes out (overlapping, on the UI thread, springs).
 * `direction` is a shared value (1 forward, -1 back) the flow sets before it
 * changes step, so Back is the exact reverse. The first step simply appears.
 */
export function StepHost({
  stepKey,
  direction,
  children,
}: {
  stepKey: string;
  direction: SharedValue<number>;
  children: React.ReactNode;
}) {
  const isReduced = useReduceMotion();
  const motion = stepMotion(isReduced);
  const [isReady, setIsReady] = React.useState(false);
  React.useEffect(() => setIsReady(true), []);
  const entering = React.useMemo(
    () => (isReady ? stepEntering(motion, direction) : undefined),
    [isReady, motion, direction],
  );
  const exiting = React.useMemo(
    () => stepExiting(motion, direction),
    [motion, direction],
  );
  return (
    <Animated.View
      key={stepKey}
      entering={entering}
      exiting={exiting}
      style={StyleSheet.absoluteFill}
    >
      {children}
    </Animated.View>
  );
}
