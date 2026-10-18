import { useAuth } from '@clerk/expo';
import { Ground, Pressable, Text, useReduceMotion } from '@booking/ui';
import { ChevronLeft } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSignOut } from '@/features/auth/useSignOut';
import { ClovieWordmark } from '@/features/brand/ClovieWordmark';

import type { OnboardingStage } from '../logic';
import { BACK_MS, backEntering, backExiting } from '../motion';
import { useOnbColors } from '../theme';
import { useHardwareBack } from '../useHardwareBack';
import { useKeyboardHeight } from '../useKeyboardHeight';
import { ProgressDots } from './ProgressDots';
import { ReplayVoiceButton } from './ReplayVoiceButton';

/** What a screen tells the chrome about itself. */
interface HeaderConfig {
  stage?: OnboardingStage;
  spoken: string;
  autoSpeak: boolean;
  hasBack: boolean;
}

interface ChromeApi {
  setHeader: (config: HeaderConfig) => void;
  /** The current screen's Back; the chrome's Back button and hardware Back call it. */
  onBack: React.MutableRefObject<(() => void) | undefined>;
}

const ChromeContext = React.createContext<ChromeApi | null>(null);

/** Keyboard height at which the footer has settled at its keyboard padding. */
const KEYBOARD_SETTLED_PT = 40;
const FOOTER_WITH_KEYBOARD = 12;

/**
 * The persistent frame of the onboarding boards: a 44pt header (Back on the
 * left, the Clovie wordmark dead centre, the quiet read-aloud icon on the
 * right), the progress dots under it, and the content. It stays mounted while
 * the steps inside it change, so only the content moves. Each step's
 * `OnboardingShell` tells it the stage, the spoken line and whether Back exists.
 * It follows the keyboard on the UI thread. `reserveDots` keeps the dots row's
 * height on a step without dots, so the content never jumps.
 */
export function OnboardingChrome({
  reserveDots = false,
  children,
}: {
  reserveDots?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const c = useOnbColors();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();
  const isReduced = useReduceMotion();
  const [header, setHeader] = React.useState<HeaderConfig>({
    spoken: '',
    autoSpeak: false,
    hasBack: false,
  });
  const onBack = React.useRef<(() => void) | undefined>(undefined);
  const api = React.useMemo<ChromeApi>(() => ({ setHeader, onBack }), []);
  const pressBack = React.useCallback(() => onBack.current?.(), []);
  // Signed in, a screen without Back swallows hardware Back (no exit mid-setup); signed out, the default stands.
  useHardwareBack(header.hasBack ? pressBack : isSignedIn ? null : undefined);

  const keyboard = useKeyboardHeight();
  const frameStyle = useAnimatedStyle(() => ({
    paddingBottom: keyboard.value,
  }));

  // The dots keep the last stage while they fade out, so they never blink to 1.
  const lastStage = React.useRef<OnboardingStage>(1);
  if (header.stage) lastStage.current = header.stage;
  const dotsOpacity = useSharedValue(header.stage ? 1 : 0);
  React.useEffect(() => {
    dotsOpacity.value = withTiming(header.stage ? 1 : 0, { duration: BACK_MS });
  }, [header.stage, dotsOpacity]);
  const dotsStyle = useAnimatedStyle(() => ({ opacity: dotsOpacity.value }));
  const showDots = reserveDots || header.stage !== undefined;

  return (
    <ChromeContext.Provider value={api}>
      <Ground style={{ flex: 1 }}>
        <Animated.View style={[{ flex: 1 }, frameStyle]}>
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
              {header.hasBack ? (
                <Animated.View
                  entering={backEntering(isReduced)}
                  exiting={backExiting(isReduced)}
                >
                  <Pressable
                    feedback="dim"
                    onPress={pressBack}
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
                </Animated.View>
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
              <ReplayVoiceButton
                text={header.spoken}
                autoSpeak={header.autoSpeak}
              />
            </View>
          </View>
          {showDots ? (
            <Animated.View
              style={[
                { alignItems: 'center', paddingTop: 4, minHeight: 12 },
                dotsStyle,
              ]}
            >
              {header.stage || reserveDots ? (
                <ProgressDots stage={header.stage ?? lastStage.current} />
              ) : null}
            </Animated.View>
          ) : null}
          <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
        </Animated.View>
      </Ground>
    </ChromeContext.Provider>
  );
}

interface ShellProps {
  /** Which progress dot is current; omit on screens that show none. */
  stage?: OnboardingStage;
  /** What the speaker icon reads. */
  spoken: string;
  autoSpeak?: boolean;
  onBack?: () => void;
  footer?: React.ReactNode;
  footerBottom?: number;
  children: React.ReactNode;
}

/** One step's body: registers its header facts with the chrome, then lays out content, sign-out and footer. */
function ShellBody({
  stage,
  spoken,
  autoSpeak = false,
  onBack,
  footer,
  footerBottom = 34,
  children,
}: ShellProps) {
  const { t } = useTranslation();
  const c = useOnbColors();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();
  const signOut = useSignOut();
  const chrome = React.useContext(ChromeContext);
  const hasBack = onBack !== undefined;
  React.useLayoutEffect(() => {
    chrome?.setHeader({ stage, spoken, autoSpeak, hasBack });
  }, [chrome, stage, spoken, autoSpeak, hasBack]);
  React.useLayoutEffect(() => {
    if (!chrome) return undefined;
    chrome.onBack.current = onBack;
    return () => {
      if (chrome.onBack.current === onBack) chrome.onBack.current = undefined;
    };
  });

  // Android reports a bottom inset the literal board padding would sit under.
  const inset = Platform.OS === 'android' ? insets.bottom : 0;
  const rest = Math.max(footerBottom, inset);
  const keyboard = useKeyboardHeight();
  // The footer padding follows the keyboard up (to the board's 12) on the UI thread.
  const footerStyle = useAnimatedStyle(() => ({
    paddingBottom: interpolate(
      keyboard.value,
      [0, KEYBOARD_SETTLED_PT],
      [rest, FOOTER_WITH_KEYBOARD],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <View style={{ flex: 1 }}>
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
          ]}
        >
          {footer}
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * A step of the onboarding boards: content, an optional footer that rides above
 * the keyboard, and the facts the header needs. Inside an `OnboardingChrome`
 * only this part is rendered (and transitions); on its own it brings its own chrome.
 */
export function OnboardingShell(props: ShellProps) {
  const chrome = React.useContext(ChromeContext);
  if (chrome) return <ShellBody {...props} />;
  return (
    <OnboardingChrome>
      <ShellBody {...props} />
    </OnboardingChrome>
  );
}
