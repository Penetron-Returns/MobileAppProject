import { Text } from '@booking/ui';
import { Clock } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { TYPE, useOnbColors } from '../theme';
import { ClovieReaction } from './ClovieReaction';
import { Heading } from './Heading';
import { OnbButton } from './OnbButton';
import { OnboardingShell } from './OnboardingShell';
import { Rise } from './Rise';

/**
 * The first board: Clovie waves and says hello, a "About 1 minute" chip, Start,
 * and a way straight to sign-in for someone who already has an account.
 */
export function WelcomeScreen({
  onStart,
  onHaveAccount,
}: {
  onStart: () => void;
  onHaveAccount: () => void;
}) {
  const { t } = useTranslation();
  const c = useOnbColors();
  const line1 = t('onboarding.welcome.line1');
  const line2 = t('onboarding.welcome.line2');
  return (
    <OnboardingShell
      spoken={t('onboarding.welcome.title')}
      autoSpeak
      footerBottom={24}
      footer={
        <>
          <OnbButton label={t('onboarding.welcome.start')} onPress={onStart} />
          <OnbButton
            variant="link"
            label={t('onboarding.welcome.haveAccount')}
            onPress={onHaveAccount}
          />
        </>
      }
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'flex-start',
          gap: 14,
          paddingHorizontal: 20,
          paddingBottom: 40,
        }}
      >
        <Rise index={0}>
          <ClovieReaction mood="excited" size={120} sparkles />
        </Rise>
        <Rise index={1} style={{ marginTop: 8 }}>
          <Heading
            size="hero"
            label={t('onboarding.welcome.title')}
          >{`${line1}\n${line2}`}</Heading>
        </Rise>
        <Rise index={2}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              height: 36,
              paddingHorizontal: 14,
              borderRadius: 18,
              backgroundColor: c.surface,
              borderWidth: 0.5,
              borderColor: c.ring,
            }}
          >
            <Clock size={16} strokeWidth={2} color={c.secondary} />
            <Text style={[TYPE.sub, { fontWeight: '500', color: c.secondary }]}>
              {t('onboarding.welcome.about')}
            </Text>
          </View>
        </Rise>
      </View>
    </OnboardingShell>
  );
}
