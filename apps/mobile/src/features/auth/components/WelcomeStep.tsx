import { Button, DURATION, Text, useDepth } from '@booking/ui';
import { Mail } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClovieAnimated } from '@/features/brand/ClovieAnimated';
import { ClovieWordmark } from '@/features/brand/ClovieWordmark';
import { openLegalPage, type LegalPage } from '@/lib/legal';
import { toast } from '@/lib/toast';

import { AuthError } from './AuthError';
import { GoogleLogo } from './GoogleLogo';
import type { AuthErrorKey } from '../errors';

/** Wordmark font size: big enough to be the hero of the board. */
const WORDMARK_SIZE = 48;
/** Delay between the entrance of each block, in ms. */
const ENTRANCE_STEP = 90;

/** A short fade-and-rise entrance, staggered by `step`; instant under reduced motion. */
function enter(step: number) {
  return FadeInDown.delay(step * ENTRANCE_STEP)
    .duration(DURATION.page)
    .reduceMotion(ReduceMotion.System);
}

interface WelcomeStepProps {
  isBusy: boolean;
  errorKey: AuthErrorKey | null;
  onGoogle: () => void;
  onEmail: () => void;
}

/** A tappable legal page name, 44pt tall, opening in the system browser. */
function LegalLink({ page, label }: { page: LegalPage; label: string }) {
  const { t } = useTranslation();
  const depth = useDepth();
  const open = async () => {
    if (!(await openLegalPage(page))) {
      toast.info(t('auth.welcome.linkFailed'));
    }
  };
  return (
    <Pressable
      onPress={() => void open()}
      accessibilityRole="link"
      accessibilityLabel={t('auth.welcome.openLink', { page: label })}
      className="min-h-11 justify-center px-1.5"
    >
      <Text
        style={{ color: depth.colors.tint }}
        className="text-meta font-semibold"
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** The welcome board: Clovie, wordmark, value prop, then the sign-in options. */
export function WelcomeStep({
  isBusy,
  errorKey,
  onGoogle,
  onEmail,
}: WelcomeStepProps) {
  const { t } = useTranslation();
  const depth = useDepth();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 justify-between">
      <View
        className="items-center"
        style={{ paddingTop: Math.max(insets.top + 40, 96) }}
      >
        {/* The hop spills above the 120pt box: keep the parent unclipped. */}
        <Animated.View entering={enter(0)}>
          <ClovieAnimated state="default" size={120} />
        </Animated.View>
        <Animated.View entering={enter(1)} className="mt-4">
          <ClovieWordmark size={WORDMARK_SIZE} />
        </Animated.View>
        <Animated.View entering={enter(2)}>
          <Text
            style={{ color: depth.colors.secondary }}
            className="mx-12 mt-2 text-center text-title"
          >
            {t('auth.welcome.valueProp')}
          </Text>
        </Animated.View>
      </View>

      <Animated.View
        entering={enter(3)}
        className="gap-3 px-6"
        style={{ paddingBottom: insets.bottom + 34 }}
      >
        <AuthError errorKey={errorKey} />
        <Button
          variant="neutral"
          size="xl"
          onPress={onGoogle}
          disabled={isBusy}
          accessibilityLabel={t('auth.welcome.google')}
        >
          <GoogleLogo size={20} />
          <Text>{t('auth.welcome.google')}</Text>
        </Button>
        <Button
          variant="secondary"
          size="xl"
          onPress={onEmail}
          disabled={isBusy}
          accessibilityLabel={t('auth.welcome.email')}
        >
          <Mail size={20} strokeWidth={1.8} color={depth.colors.tint} />
          <Text>{t('auth.welcome.email')}</Text>
        </Button>
        <Text
          style={{ color: depth.colors.secondary }}
          className="mx-3 mt-1.5 text-center text-meta"
        >
          {t('auth.welcome.legalPrefix')}
        </Text>
        <View className="flex-row items-center justify-center gap-1">
          <LegalLink page="terms" label={t('auth.welcome.terms')} />
          <Text style={{ color: depth.colors.secondary }} className="text-meta">
            {t('auth.welcome.and')}
          </Text>
          <LegalLink page="privacy" label={t('auth.welcome.privacy')} />
        </View>
      </Animated.View>
    </View>
  );
}
