import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  FadeIn,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useMotionActive } from '@/hooks/useMotionActive';

import { useOnbColors } from '../theme';
import { ClovieReaction } from './ClovieReaction';
import { Heading, Subline } from './Heading';
import { OnbButton } from './OnbButton';
import { OnboardingShell } from './OnboardingShell';
import { Rise } from './Rise';

/** One dot of the typing bubble: opacity .3 to 1 over 1.2s, 200ms after the one before. */
function PulseDot({ delay }: { delay: number }) {
  const c = useOnbColors();
  const isMotion = useMotionActive();
  const t = useSharedValue(1);
  React.useEffect(() => {
    if (!isMotion) {
      cancelAnimation(t);
      t.value = 1;
      return;
    }
    t.value = 0;
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 600 }), -1, true),
    );
    return () => cancelAnimation(t);
  }, [isMotion, delay, t]);
  const style = useAnimatedStyle(() => ({ opacity: 0.3 + 0.7 * t.value }));
  return (
    <Animated.View
      style={[
        { width: 8, height: 8, borderRadius: 4, backgroundColor: c.secondary },
        style,
      ]}
    />
  );
}

/**
 * Board "Confirming payment": Clovie thinks beside a three-dot bubble while the
 * plan flips. When it lands the line cross-fades to "Paid". "I didn't pay" is
 * always there, so there is never a dead end.
 */
export function PayingScreen({
  isPaid,
  onNotPaid,
}: {
  isPaid: boolean;
  onNotPaid: () => void;
}) {
  const { t } = useTranslation();
  const c = useOnbColors();
  const title = isPaid
    ? t('onboarding.paying.paid')
    : t('onboarding.paying.title');
  const hint = t('onboarding.paying.hint');
  return (
    <OnboardingShell
      spoken={`${title} ${hint}`}
      footer={
        isPaid ? undefined : (
          <OnbButton
            variant="link"
            label={t('onboarding.checkout.confirming.notPaid')}
            onPress={onNotPaid}
          />
        )
      }
    >
      <View
        style={{
          flex: 1,
          alignItems: 'flex-start',
          gap: 10,
          paddingHorizontal: 20,
          paddingTop: 4,
        }}
      >
        <Rise
          index={0}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            marginTop: 40,
          }}
        >
          <ClovieReaction
            mood={isPaid ? 'delighted' : 'thoughtful'}
            size={90}
          />
          <View
            accessible={false}
            style={{
              flexDirection: 'row',
              gap: 5,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 18,
              backgroundColor: c.surface,
              borderWidth: 0.5,
              borderColor: c.ring,
            }}
          >
            {[0, 200, 400].map((d) => (
              <PulseDot key={d} delay={d} />
            ))}
          </View>
        </Rise>
        <Rise index={1} style={{ marginTop: 8 }}>
          <Animated.View
            key={title}
            entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}
          >
            <Heading>{title}</Heading>
          </Animated.View>
        </Rise>
        <Rise index={2}>
          <Subline>{hint}</Subline>
        </Rise>
      </View>
    </OnboardingShell>
  );
}
