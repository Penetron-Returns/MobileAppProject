import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ClovieReaction } from './ClovieReaction';
import { Heading, Subline } from './Heading';
import { OnbButton } from './OnbButton';
import { OnboardingShell } from './OnboardingShell';
import { Rise } from './Rise';

/**
 * Board "App unlocked": the moment the checkout tab closes on a paid plan.
 * Everything is already known (the plan is active, the business has a name),
 * so it renders at once with nothing to fetch. "Meet Clovie" moves on to
 * whatever the gate shows next (companion setup or the tabs).
 */
export function AppUnlockedScreen({
  businessName,
  onContinue,
}: {
  businessName: string;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const title = t('onboarding.unlocked.title');
  const subtitle = t('onboarding.unlocked.subtitle', {
    business: businessName,
  });
  return (
    <OnboardingShell
      spoken={`${title} ${subtitle}`}
      footer={
        <OnbButton
          label={t('onboarding.unlocked.action')}
          onPress={onContinue}
        />
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
          <ClovieReaction mood="delighted" size={120} />
        </Rise>
        <Rise index={1} style={{ marginTop: 8 }}>
          <Heading size="hero">{title}</Heading>
        </Rise>
        <Rise index={2}>
          <Subline>{subtitle}</Subline>
        </Rise>
      </View>
    </OnboardingShell>
  );
}
