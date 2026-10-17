import { Text } from '@booking/ui';
import { Check } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  Easing,
  FadeOut,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { analytics } from '@/features/analytics';
import { BRAND } from '@/features/brand/brandColors';
import { useCompanionSetup } from '@/features/companion/hooks';
import { useMotionActive } from '@/hooks/useMotionActive';

import { TYPE, useOnbColors } from '../theme';
import { ClovieReaction } from './ClovieReaction';
import { Heading, Subline } from './Heading';
import { OnbButton } from './OnbButton';
import { OnboardingShell } from './OnboardingShell';
import { Rise } from './Rise';

/** Nerova provisions in seconds; past this the screen admits it is slow and offers a retry. */
export const SLOW_AFTER_MS = 45_000;
const POLL_MS = 3_000;
/** The checks land one after another, about this far apart. */
export const CHECK_EVERY_MS = 900;
const STEPS = ['hours', 'services', 'calendar'] as const;

/** How many of the checks have landed after `elapsedMs`; the last one waits for the real setup. */
export function checksDone(elapsedMs: number): number {
  return Math.min(STEPS.length - 1, Math.floor(elapsedMs / CHECK_EVERY_MS));
}

/** Clovie's halo: scale 1 to 1.5 while fading .45 to 0, every 1.8s. Still under Reduce Motion. */
function Halo() {
  const isMotion = useMotionActive();
  const t = useSharedValue(0);
  React.useEffect(() => {
    if (!isMotion) {
      cancelAnimation(t);
      t.value = 0;
      return;
    }
    t.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }),
      -1,
    );
    return () => cancelAnimation(t);
  }, [isMotion, t]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - t.value),
    transform: [{ scale: 1 + 0.5 * t.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 10,
          top: 10,
          width: 120,
          height: 120,
          borderRadius: 60,
          backgroundColor: BRAND.blue,
        },
        style,
      ]}
    />
  );
}

/** The board's spinner: a 22pt ring with a blue arc, one turn a second. Still under Reduce Motion. */
function Spinner() {
  const c = useOnbColors();
  const isMotion = useMotionActive();
  const turn = useSharedValue(0);
  React.useEffect(() => {
    if (!isMotion) {
      cancelAnimation(turn);
      turn.value = 0;
      return;
    }
    turn.value = withRepeat(
      withTiming(360, { duration: 1000, easing: Easing.linear }),
      -1,
    );
    return () => cancelAnimation(turn);
  }, [isMotion, turn]);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${turn.value}deg` }],
  }));
  return (
    <Animated.View
      style={[
        {
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2.5,
          borderColor: c.spinnerTrack,
          borderTopColor: c.tint,
        },
        style,
      ]}
    />
  );
}

function Step({
  label,
  state,
}: {
  label: string;
  state: 'done' | 'active' | 'waiting';
}) {
  const c = useOnbColors();
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityState={{
        checked: state === 'done',
        busy: state === 'active',
      }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
    >
      {state === 'done' ? (
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.green,
          }}
        >
          <Check size={14} strokeWidth={3} color={c.onFill} />
        </View>
      ) : state === 'active' ? (
        <Spinner />
      ) : (
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 2.5,
            borderColor: c.spinnerTrack,
          }}
        />
      )}
      <Text
        style={[TYPE.body, { color: state === 'done' ? c.label : c.secondary }]}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * Board "Getting me ready": Clovie breathes inside a pulsing halo while the
 * hours, services and calendar tick off. It waits for Nerova to create the
 * companion account; the app shell leaves this screen by itself when the setup
 * state stops saying `provision_account`, and the Clovie tab takes over.
 */
export function CompanionSetupScreen() {
  const { t } = useTranslation();
  const setup = useCompanionSetup({ enabled: true, pollMs: POLL_MS });
  const [isSlow, setIsSlow] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    analytics.track('setup_waiting_shown');
    const started = Date.now();
    const slow = setTimeout(() => setIsSlow(true), SLOW_AFTER_MS);
    const tick = setInterval(
      () => setElapsed(Date.now() - started),
      CHECK_EVERY_MS,
    );
    return () => {
      clearTimeout(slow);
      clearInterval(tick);
    };
  }, []);

  const title = isSlow
    ? t('onboarding.setup.slow.title')
    : t('onboarding.setup.title');
  const hint = isSlow
    ? t('onboarding.setup.slow.hint')
    : t('onboarding.setup.hint');
  const done = checksDone(elapsed);
  return (
    <OnboardingShell
      spoken={`${title} ${hint}`}
      footer={
        isSlow ? (
          <OnbButton
            label={t('onboarding.setup.retry')}
            loading={setup.isFetching}
            onPress={() => void setup.refetch()}
          />
        ) : undefined
      }
    >
      <Animated.View
        exiting={FadeOut.duration(200).reduceMotion(ReduceMotion.System)}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          paddingHorizontal: 20,
          paddingBottom: 80,
        }}
      >
        <Rise index={0}>
          <View
            style={{
              width: 140,
              height: 140,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Halo />
            <ClovieReaction mood="calm" size={120} />
          </View>
        </Rise>
        <Rise index={1} style={{ marginTop: 6 }}>
          <Heading align="center">{title}</Heading>
        </Rise>
        <Rise index={2}>
          <Subline align="center">{hint}</Subline>
        </Rise>
        <Rise index={3} style={{ marginTop: 14, gap: 10 }}>
          <View
            accessibilityLabel={t('onboarding.setup.progress')}
            style={{ gap: 10 }}
          >
            {STEPS.map((step, i) => (
              <Step
                key={step}
                label={t(`onboarding.setup.steps.${step}`)}
                state={i < done ? 'done' : i === done ? 'active' : 'waiting'}
              />
            ))}
          </View>
        </Rise>
      </Animated.View>
    </OnboardingShell>
  );
}
