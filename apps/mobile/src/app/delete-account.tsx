import { Button, Screen, Text } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, View } from 'react-native';

import { LEGAL_URLS } from '@/lib/legal';

const SUPPORT_EMAIL = 'support@nerovasystems.com';

/**
 * Public "how to delete your account" page (`/delete-account` on the web export). Google Play asks for a
 * URL outside the app: no sign-in, static copy, the in-app path and the email fallback.
 */
export default function PublicDeleteAccountScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-xl gap-3 px-5 py-10">
        <Text accessibilityRole="header" className="text-title font-semibold">
          {t('account.publicDelete.title')}
        </Text>
        <Text>{t('account.publicDelete.intro')}</Text>
        <Section
          heading={t('account.publicDelete.inApp')}
          body={t('account.publicDelete.inAppSteps')}
        />
        <Section
          heading={t('account.publicDelete.byEmail')}
          body={t('account.publicDelete.byEmailBody')}
        />
        <Section
          heading={t('account.publicDelete.whatDeleted')}
          body={t('account.publicDelete.whatDeletedBody')}
        />
        <View className="mt-3 gap-2">
          <Button
            onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          >
            <Text>{t('account.publicDelete.emailAction')}</Text>
          </Button>
          <Button
            variant="secondary"
            onPress={() => void Linking.openURL(LEGAL_URLS.privacy)}
          >
            <Text>{t('account.publicDelete.privacy')}</Text>
          </Button>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Section({ heading, body }: { heading: string; body: string }) {
  return (
    <View className="mt-3 gap-1">
      <Text accessibilityRole="header" className="font-semibold">
        {heading}
      </Text>
      <Text className="text-muted-foreground">{body}</Text>
    </View>
  );
}
