import { Button, Ground, IconDome, Text } from '@booking/ui';
import { Hourglass } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SpeakButton } from '@/components/SpeakButton';
import { useSignOut } from '@/features/auth/useSignOut';

/**
 * What a team member sees while the business has no active plan: only the
 * owner can choose one, so there is nothing to do here but wait or sign out.
 */
export function InactiveBusinessScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const signOut = useSignOut();
  const title = t('onboarding.inactive.title');
  const hint = t('onboarding.inactive.hint');
  return (
    <Ground className="flex-1">
      <View
        className="flex-1 items-center justify-center gap-4 px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <IconDome icon={Hourglass} />
        <Text
          role="heading"
          aria-level="1"
          className="text-center text-large-title font-bold"
        >
          {title}
        </Text>
        <Text className="text-center text-title text-muted-foreground">
          {hint}
        </Text>
        <SpeakButton text={`${title}. ${hint}`} />
        <Button
          size="xl"
          variant="secondary"
          className="mt-4 self-stretch"
          onPress={() => void signOut()}
          accessibilityLabel={t('onboarding.inactive.signOut')}
        >
          <Text>{t('onboarding.inactive.signOut')}</Text>
        </Button>
      </View>
    </Ground>
  );
}
