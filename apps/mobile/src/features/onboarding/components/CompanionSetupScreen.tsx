import { Button, Text } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ClovieAnimated } from '@/features/brand/ClovieAnimated';
import { useCompanionSetup } from '@/features/companion/hooks';

import { OnboardingFrame } from './OnboardingFrame';

/** Nerova provisions in seconds; past this the screen admits it is slow and offers a retry. */
export const SLOW_AFTER_MS = 45_000;
const POLL_MS = 3_000;

/**
 * "Clovie is being set up": waits while Nerova creates the companion account.
 * The app shell leaves this screen by itself the moment the setup state stops
 * saying `provision_account`, and the Clovie tab (Nerova's own first-run setup
 * inside its sheet) takes over.
 */
export function CompanionSetupScreen() {
  const { t } = useTranslation();
  const setup = useCompanionSetup({ enabled: true, pollMs: POLL_MS });
  const [isSlow, setIsSlow] = React.useState(false);
  React.useEffect(() => {
    const id = setTimeout(() => setIsSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(id);
  }, []);

  const title = isSlow
    ? t('onboarding.setup.slow.title')
    : t('onboarding.setup.title');
  const hint = isSlow
    ? t('onboarding.setup.slow.hint')
    : t('onboarding.setup.hint');
  return (
    <OnboardingFrame
      stage={4}
      title={t('onboarding.setup.title')}
      spoken={`${title} ${hint}`}
    >
      <View
        className="items-center gap-3 px-5"
        accessibilityLiveRegion="polite"
        accessible
        accessibilityLabel={`${title}. ${hint}`}
      >
        <ClovieAnimated state="working" size={160} />
        <Text className="text-center text-section font-semibold">{title}</Text>
        <Text className="text-center text-title text-muted-foreground">
          {hint}
        </Text>
        {isSlow ? (
          <Button
            size="xl"
            className="mt-2 self-stretch"
            loading={setup.isFetching}
            onPress={() => void setup.refetch()}
            accessibilityLabel={t('onboarding.setup.retry')}
          >
            <Text>{t('onboarding.setup.retry')}</Text>
          </Button>
        ) : null}
      </View>
    </OnboardingFrame>
  );
}
