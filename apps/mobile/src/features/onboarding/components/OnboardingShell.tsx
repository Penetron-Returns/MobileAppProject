import { useAuth } from '@clerk/expo';
import {
  Ground,
  KEYBOARD_AVOIDING_BEHAVIOR,
  Pressable,
  Text,
} from '@booking/ui';
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

import { useSignOut } from '@/features/auth/useSignOut';
import { ClovieWordmark } from '@/features/brand/ClovieWordmark';

import type { OnboardingStage } from '../logic';
import { useOnbColors } from '../theme';
import { useHardwareBack } from '../useHardwareBack';
import { ProgressDots } from './ProgressDots';
import { ReplayVoiceButton } from './ReplayVoiceButton';

/** The boards' `--spring` curve; the footer follows the keyboard over 280ms. */
const SPRING_EASE = Easing.bezier(0.32, 0.72, 0, 1);
const FOOTER_MS = 280;

/**
 * The shared shell of the onboarding boards: a 44pt header (Back on the left,
 * the Clovie wordmark dead centre, the quiet read-aloud icon on the right), the
 * progress dots just under it, the content, and a footer that sits above the keyboard. `footerBottom` is the
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
  const { isSignedIn } = useAuth();
  const signOut = useSignOut();
  // Signed in, a screen without Back swallows hardware Back (no exit mid-setup); signed out, the default stands.
  useHardwareBack(onBack ?? (isSignedIn ? null : undefined));
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
          {/* Absolute so it is centred on the screen whatever the side buttons hold. */}
          <View
            testID="onboarding-wordmark"
            accessible
            accessibilityRole="image"
            accessibilityLabel={t('auth.appName')}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 44,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <ClovieWordmark size={22} />
            </View>
          </View>
          <View style={{ width: 44, height: 44 }}>
            <ReplayVoiceButton text={spoken} autoSpeak={autoSpeak} />
          </View>
        </View>
        {stage ? (
          <View style={{ alignItems: 'center', paddingTop: 4 }}>
            <ProgressDots stage={stage} />
          </View>
        ) : null}
        <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
        {isSignedIn ? (
          <Pressable
            feedback="dim"
            onPress={() => void signOut()}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.signOut')}
            style={{
              minHeight: 44,
              alignSelf: 'center',
              justifyContent: 'center',
              paddingHorizontal: 16,
            }}
          >
            <Text style={{ color: c.tint, fontSize: 15 }}>
              {t('onboarding.signOut')}
            </Text>
          </Pressable>
        ) : null}
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
