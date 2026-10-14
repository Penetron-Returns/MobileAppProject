import { Button, Text, useDepth } from '@booking/ui';
import { Mail } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppMark } from './AppMark';
import { AuthError } from './AuthError';
import type { AuthErrorKey } from '../errors';

interface WelcomeStepProps {
  isBusy: boolean;
  errorKey: AuthErrorKey | null;
  onGoogle: () => void;
  onEmail: () => void;
}

/** The welcome board: mark, headline, value prop, then the sign-in options. */
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
        style={{ paddingTop: Math.max(insets.top + 56, 112) }}
      >
        <AppMark />
        <Text
          style={{ color: depth.colors.secondary }}
          className="mt-3.5 text-title font-semibold"
        >
          {t('auth.appName')}
        </Text>
        <Text
          role="heading"
          aria-level="1"
          className="mx-9 mt-7 text-center text-large-title font-bold"
        >
          {t('auth.welcome.headline')}
        </Text>
        <Text
          style={{ color: depth.colors.secondary }}
          className="mx-12 mt-2.5 text-center text-title"
        >
          {t('auth.welcome.valueProp')}
        </Text>
      </View>

      <View
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
          <Text
            className="w-5 text-center font-bold"
            style={{ color: '#4285F4', fontSize: 19, lineHeight: 22 }}
          >
            G
          </Text>
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
          {`${t('auth.welcome.legalPrefix')} ${t('auth.welcome.terms')} ${t('auth.welcome.and')} ${t('auth.welcome.privacy')}.`}
        </Text>
      </View>
    </View>
  );
}
