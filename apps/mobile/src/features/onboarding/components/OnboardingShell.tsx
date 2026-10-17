import { Ground, KEYBOARD_AVOIDING_BEHAVIOR, Pressable } from '@booking/ui';
import { ChevronLeft } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { OnboardingStage } from '../logic';
import { useOnbColors } from '../theme';
import { ProgressDots } from './ProgressDots';
import { ReplayVoiceButton } from './ReplayVoiceButton';

/** The boards' `--spring` curve; the footer follows the keyboard over 280ms. */
const SPRING_EASE = Easing.bezier(0.32, 0.72, 0, 1);
const FOOTER_MS = 280;

/**
 * The shared shell of the onboarding boards: a 44pt header (Back on the left,
 * progress dots in the middle, the quiet read-aloud icon on the right), the
 * content, and a footer that sits above the keyboard. `footerBottom` is the
 * board's bottom padding (24, 34, or 12 with the keyboard up).
 */
export function OnboardingShell({
  stage,
  spoken,
  autoSpeak = false,
  onBack,
  footer,
  footerBottom = 34,
  children,
}: {
  /** Which progress dot is current; omit on screens that show none. */
  stage?: OnboardingStage;
  /** What the speaker icon reads. */
  spoken: string;
  autoSpeak?: boolean;
  onBack?: () => void;
  footer?: React.ReactNode;
  footerBottom?: number;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const c = useOnbColors();
  const insets = useSafeAreaInsets();
  const bottom = useSharedValue(footerBottom);
  React.useEffect(() => {
    bottom.value = withTiming(footerBottom, {
      duration: FOOTER_MS,
      easing: SPRING_EASE,
      reduceMotion: ReduceMotion.System,
    });
  }, [footerBottom, bottom]);
  const footerStyle = useAnimatedStyle(() => ({ paddingBottom: bottom.value }));
  // Android reports a bottom inset the boards' literal padding would sit under.
  const inset = Platform.OS === 'android' ? insets.bottom : 0;

  return (
    <Ground style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={KEYBOARD_AVOIDING_BEHAVIOR}
      >
        <View
          style={{
            height: insets.top + 44,
            paddingTop: insets.top,
            paddingHorizontal: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ width: 44, height: 44 }}>
            {onBack ? (
              <Pressable
                feedback="dim"
                onPress={onBack}
                accessibilityRole="button"
                accessibilityLabel={t('onboarding.back')}
                style={{
                  width: 44,
                  height: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ChevronLeft size={28} strokeWidth={2} color={c.tint} />
              </Pressable>
            ) : null}
          </View>
          {stage ? <ProgressDots stage={stage} /> : <View />}
          <View style={{ width: 44, height: 44 }}>
            <ReplayVoiceButton text={spoken} autoSpeak={autoSpeak} />
          </View>
        </View>
        <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
        {footer ? (
          <Animated.View
            style={[
              { paddingHorizontal: 20, paddingTop: 12, gap: 8 },
              footerStyle,
              inset > footerBottom ? { paddingBottom: inset } : null,
            ]}
          >
            {footer}
          </Animated.View>
        ) : null}
      </KeyboardAvoidingView>
    </Ground>
  );
}
