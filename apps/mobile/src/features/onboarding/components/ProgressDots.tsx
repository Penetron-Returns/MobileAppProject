import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import {
  STAGE_COUNT,
  dotStates,
  type DotState,
  type OnboardingStage,
} from '../logic';
import { DOT_ACTIVE_WIDTH, DOT_SPRING, DOT_WIDTH } from '../motion';
import { useOnbColors } from '../theme';

/** One dot: the active pill grows to 20pt and the finished ones turn blue, both on a spring. */
function Dot({ state }: { state: DotState }) {
  const c = useOnbColors();
  const grow = useSharedValue(state === 'active' ? 1 : 0);
  const fill = useSharedValue(state === 'todo' ? 0 : 1);
  React.useEffect(() => {
    grow.value = withSpring(state === 'active' ? 1 : 0, DOT_SPRING);
    fill.value = withSpring(state === 'todo' ? 0 : 1, DOT_SPRING);
  }, [state, grow, fill]);
  const style = useAnimatedStyle(() => ({
    width: DOT_WIDTH + (DOT_ACTIVE_WIDTH - DOT_WIDTH) * grow.value,
    backgroundColor: interpolateColor(
      Math.min(1, Math.max(0, fill.value)),
      [0, 1],
      [c.dotOff, c.tint],
    ),
  }));
  return (
    <Animated.View
      testID={`dot-${state}`}
      style={[{ height: 8, borderRadius: 4 }, style]}
    />
  );
}

/** The three progress dots: finished ones are 8pt blue, the current one a 20pt blue pill, the rest grey. */
export function ProgressDots({ stage }: { stage: OnboardingStage }) {
  const { t } = useTranslation();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('onboarding.step', {
        step: stage,
        max: STAGE_COUNT,
      })}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
    >
      {dotStates(stage).map((state, i) => (
        <Dot key={i} state={state} />
      ))}
    </View>
  );
}
