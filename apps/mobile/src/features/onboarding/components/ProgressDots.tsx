import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { STAGE_COUNT, dotStates, type OnboardingStage } from '../logic';
import { useOnbColors } from '../theme';

/** The three progress dots: finished ones are 8pt blue, the current one a 20pt blue pill, the rest grey. */
export function ProgressDots({ stage }: { stage: OnboardingStage }) {
  const { t } = useTranslation();
  const c = useOnbColors();
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
        <View
          key={i}
          testID={`dot-${state}`}
          style={{
            width: state === 'active' ? 20 : 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: state === 'todo' ? c.dotOff : c.tint,
          }}
        />
      ))}
    </View>
  );
}
