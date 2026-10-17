import { Button, Surface, Text, useDepth } from '@booking/ui';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { isCheckoutProblem, type CheckoutPhase } from '../checkout';

/** i18n group under `onboarding.checkout` for each phase that has a message. */
const GROUP = {
  starting: null,
  browser: null,
  confirming: 'confirming',
  cancelled: 'cancelled',
  unconfirmed: 'unconfirmed',
  failed: 'failed',
  offline: 'offline',
  not_configured: 'notConfigured',
} as const;

/**
 * What the owner sees after pressing Start: a spinner while the checkout opens
 * and while payment is confirmed, and for every other outcome a plain message
 * with one way forward. Never a dead end.
 */
export function CheckoutStatus({
  phase,
  onRetry,
  onCheckAgain,
  onNotPaid,
  onBack,
}: {
  phase: Exclude<CheckoutPhase, { kind: 'idle' | 'active' }>;
  /** Try the same plan again. */
  onRetry: () => void;
  onCheckAgain: () => void;
  onNotPaid: () => void;
  /** Return to the plan cards. */
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const group = GROUP[phase.kind];

  if (!isCheckoutProblem(phase)) {
    return (
      <Surface
        variant="raised"
        radius={26}
        className="mx-5 items-center gap-3 p-6"
        accessibilityLiveRegion="polite"
      >
        <ActivityIndicator size="large" color={depth.colors.tint} />
        <Text className="text-center text-section font-semibold">
          {t(
            group
              ? `onboarding.checkout.${group}.title`
              : 'onboarding.checkout.starting',
          )}
        </Text>
        {phase.kind === 'confirming' ? (
          <>
            <Text className="text-center text-title text-muted-foreground">
              {t('onboarding.checkout.confirming.hint')}
            </Text>
            <Button
              variant="ghost"
              size="xl"
              onPress={onNotPaid}
              accessibilityLabel={t('onboarding.checkout.confirming.notPaid')}
            >
              <Text>{t('onboarding.checkout.confirming.notPaid')}</Text>
            </Button>
          </>
        ) : null}
      </Surface>
    );
  }

  const primary =
    phase.kind === 'unconfirmed'
      ? { label: t('onboarding.checkout.unconfirmed.check'), run: onCheckAgain }
      : { label: t('onboarding.checkout.retry'), run: onRetry };
  return (
    <Surface
      variant="raised"
      radius={26}
      className="mx-5 gap-3 p-6"
      accessibilityLiveRegion="polite"
    >
      <Text
        role="heading"
        aria-level="2"
        className="text-section font-semibold"
      >
        {t(`onboarding.checkout.${GROUP[phase.kind]}.title`)}
      </Text>
      <Text className="text-title text-muted-foreground">
        {t(`onboarding.checkout.${GROUP[phase.kind]}.hint`)}
      </Text>
      <View className="mt-2 gap-2">
        <Button
          size="xl"
          onPress={primary.run}
          accessibilityLabel={primary.label}
        >
          <Text>{primary.label}</Text>
        </Button>
        <Button
          size="xl"
          variant="secondary"
          onPress={onBack}
          accessibilityLabel={t('onboarding.checkout.back')}
        >
          <Text>{t('onboarding.checkout.back')}</Text>
        </Button>
      </View>
    </Surface>
  );
}
