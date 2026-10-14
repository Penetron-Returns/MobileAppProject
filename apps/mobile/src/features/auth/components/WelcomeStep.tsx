import { Mail } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';

import { AppMark } from './AppMark';
import { AuthButton } from './AuthButton';
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
        <AuthButton
          label={t('auth.welcome.google')}
          onPress={onGoogle}
          isDisabled={isBusy}
          icon={
            <Text
              className="w-5 text-center font-bold"
              style={{ color: '#4285F4', fontSize: 19, lineHeight: 22 }}
            >
              G
            </Text>
          }
        />
        <AuthButton
          label={t('auth.welcome.email')}
          onPress={onEmail}
          tone="tint"
          isDisabled={isBusy}
          icon={<Mail size={20} strokeWidth={1.8} color={depth.colors.tint} />}
        />
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
