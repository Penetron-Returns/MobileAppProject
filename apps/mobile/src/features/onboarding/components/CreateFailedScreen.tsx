import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { describeError } from '@/lib/toast';

import { ClovieReaction } from './ClovieReaction';
import { Heading, Subline } from './Heading';
import { OnbButton } from './OnbButton';
import { OnboardingShell } from './OnboardingShell';
import { Rise } from './Rise';

/** Creating the business failed (offline, or the API said no): the same calm layout as a failed payment, with one retry. */
export function CreateFailedScreen({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const title = t('onboarding.create.failed');
  const { message } = describeError(error);
  return (
    <OnboardingShell
      spoken={`${title} ${message}`}
      footer={
        <OnbButton label={t('onboarding.create.retry')} onPress={onRetry} />
      }
    >
      <View
        style={{
          flex: 1,
          alignItems: 'flex-start',
          gap: 10,
          paddingHorizontal: 20,
          paddingTop: 4,
        }}
      >
        <Rise index={0} style={{ marginTop: 40 }}>
          <ClovieReaction mood="sympathetic" size={90} />
        </Rise>
        <Rise index={1} style={{ marginTop: 8 }}>
          <Heading>{title}</Heading>
        </Rise>
        <Rise index={2}>
          <Subline>{message}</Subline>
        </Rise>
      </View>
    </OnboardingShell>
  );
}
