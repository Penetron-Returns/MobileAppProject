import { RotateCcw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { CheckoutProblem } from '@/features/plans/checkout';

import { ClovieReaction } from './ClovieReaction';
import { Heading, Subline } from './Heading';
import { OnbButton } from './OnbButton';
import { OnboardingShell } from './OnboardingShell';
import { Rise } from './Rise';

/**
 * Board "Payment failed": Clovie leans in, calm words, two ways on. No shake and
 * no red. A payment that may still land (`unconfirmed`) never says "you haven't
 * been charged", and the offline and not-configured cases say what is wrong.
 */
export function PayFailedScreen({
  phase,
  onTryAgain,
  onCheckAgain,
  onPickAnother,
  onBack,
}: {
  phase: CheckoutProblem;
  onTryAgain: () => void;
  onCheckAgain: () => void;
  onPickAnother: () => void;
  /** Back to the plan list (the same as picking another plan). */
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  // "You haven't been charged" only when checkout never opened (failed); a stopped wait may still have paid.
  const isBoardCopy = phase.kind === 'failed';
  const group = phase.kind === 'not_configured' ? 'notConfigured' : phase.kind;
  const title = isBoardCopy
    ? t('onboarding.payFailed.title')
    : t(`onboarding.checkout.${group}.title`);
  const hint = isBoardCopy
    ? t('onboarding.payFailed.hint')
    : t(`onboarding.checkout.${group}.hint`);
  const isCheck = phase.kind === 'unconfirmed';
  return (
    <OnboardingShell
      onBack={onBack}
      spoken={`${title} ${hint}`}
      footer={
        <>
          <OnbButton
            icon={RotateCcw}
            label={
              isCheck
                ? t('onboarding.checkout.unconfirmed.check')
                : t('onboarding.payFailed.tryAgain')
            }
            onPress={isCheck ? onCheckAgain : onTryAgain}
          />
          <OnbButton
            variant="secondary"
            label={t('onboarding.payFailed.another')}
            onPress={onPickAnother}
          />
        </>
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
          <Subline>{hint}</Subline>
        </Rise>
      </View>
    </OnboardingShell>
  );
}
