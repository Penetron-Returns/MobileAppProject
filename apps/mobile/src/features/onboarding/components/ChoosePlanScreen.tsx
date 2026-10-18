import { ErrorState, Skeleton, Text } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { analytics } from '@/features/analytics';
import { paidPlans } from '@/features/plans/compare';
import { isCheckoutPlan, type CheckoutPlanId } from '@/features/plans/checkout';
import { usePlans } from '@/features/plans/hooks';
import { formatRand } from '@/features/plans/logic';
import { useCheckout } from '@/features/plans/useCheckout';
import { describeError } from '@/lib/toast';

import { TYPE, useOnbColors } from '../theme';
import { ClovieReaction } from './ClovieReaction';
import { Heading } from './Heading';
import { OnbButton } from './OnbButton';
import { OnboardingShell } from './OnboardingShell';
import { PayFailedScreen } from './PayFailedScreen';
import { PayingScreen } from './PayingScreen';
import { PlanCard } from './PlanCard';
import { Rise } from './Rise';

/** The plan chosen first: the entry plan, as the boards show it. */
const DEFAULT_PLAN: CheckoutPlanId = 'starter';

/**
 * Board "Plan": three cards (no free option) and a button that names the chosen
 * plan. Continue opens secure checkout in the in-app browser; the screen then
 * waits for the payment, and shows a calm "That didn't go through" with a way
 * on if it fails. The app routes on by itself once the plan is active.
 */
export function ChoosePlanScreen({ onBack }: { onBack?: () => void } = {}) {
  const { t } = useTranslation();
  const c = useOnbColors();
  const plans = usePlans();
  const checkout = useCheckout({
    onReturned: (outcome, plan) => {
      analytics.track('checkout_returned', { outcome });
      if (outcome === 'active' && plan) {
        analytics.track('plan_activated', { plan });
      }
    },
  });
  const [chosen, setChosen] = React.useState<CheckoutPlanId>(DEFAULT_PLAN);
  const tiers = paidPlans(plans.data?.plans ?? []).filter((p) =>
    isCheckoutPlan(p.id),
  );
  const selected = tiers.find((p) => p.id === chosen) ?? tiers[0];

  React.useEffect(() => {
    analytics.track('plan_viewed');
  }, []);

  const start = (id: CheckoutPlanId) => {
    analytics.track('checkout_started', { plan: id });
    void checkout.start(id);
  };
  const { phase } = checkout;

  if (phase.kind === 'confirming' || phase.kind === 'active') {
    return (
      <PayingScreen
        isPaid={phase.kind === 'active'}
        onNotPaid={checkout.notPaid}
        onBack={checkout.notPaid}
      />
    );
  }
  if (
    phase.kind !== 'idle' &&
    phase.kind !== 'starting' &&
    phase.kind !== 'browser'
  ) {
    return (
      <PayFailedScreen
        phase={phase}
        onTryAgain={() => start(chosen)}
        onCheckAgain={() => void checkout.checkAgain()}
        onPickAnother={checkout.reset}
        onBack={checkout.reset}
      />
    );
  }

  const title = `${t('onboarding.plan.line1')}\n${t('onboarding.plan.line2')}`;
  const spoken = [
    title.replace('\n', ' '),
    ...tiers.map((p) =>
      t('onboarding.plan.spokenPlan', {
        name: p.name,
        price: formatRand(p.price_cents),
        count: p.included_jobs ?? 0,
      }),
    ),
  ].join(' ');
  const extra = tiers[0]?.extra_job_cents ?? 0;
  const isStarting = phase.kind === 'starting' || phase.kind === 'browser';
  const pick = selected && isCheckoutPlan(selected.id) ? selected : null;

  let body: React.ReactNode;
  if (plans.isError) {
    body = (
      <ErrorState
        variant="banner"
        title={t('onboarding.plan.loadFailed')}
        {...describeError(plans.error)}
        onRetry={() => void plans.refetch()}
      />
    );
  } else if (!plans.data) {
    body = (
      <View
        style={{ gap: 12 }}
        accessibilityLabel={t('onboarding.plan.loading')}
        accessibilityState={{ busy: true }}
      >
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-[22px]" />
        ))}
      </View>
    );
  } else {
    body = (
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('onboarding.plan.label')}
        style={{ gap: 12 }}
      >
        {tiers.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isSelected={selected?.id === plan.id}
            onPress={() => isCheckoutPlan(plan.id) && setChosen(plan.id)}
          />
        ))}
      </View>
    );
  }

  return (
    <OnboardingShell
      stage={3}
      onBack={isStarting ? undefined : onBack}
      spoken={spoken}
      footerBottom={24}
      footer={
        pick ? (
          <>
            <OnbButton
              label={t('onboarding.plan.continueWith', { name: pick.name })}
              onPress={() => isCheckoutPlan(pick.id) && start(pick.id)}
              loading={isStarting}
            />
            <Text
              style={[TYPE.sub, { color: c.secondary, textAlign: 'center' }]}
            >
              {t('onboarding.plan.cancelAnytime')}
            </Text>
          </>
        ) : undefined
      }
    >
      <View
        style={{
          flex: 1,
          alignItems: 'flex-start',
          gap: 12,
          paddingHorizontal: 20,
          paddingTop: 4,
        }}
      >
        <Rise index={0}>
          <ClovieReaction mood="curious" size={64} />
        </Rise>
        <Rise index={1}>
          <Heading label={title.replace('\n', ' ')}>{title}</Heading>
        </Rise>
        <Rise index={2} style={{ alignSelf: 'stretch', marginTop: 4 }}>
          {body}
        </Rise>
        {extra > 0 ? (
          <Rise index={3}>
            <Text style={[TYPE.sub, { color: c.secondary, marginTop: 2 }]}>
              {t('onboarding.plan.extra', { price: formatRand(extra) })}
            </Text>
          </Rise>
        ) : null}
      </View>
    </OnboardingShell>
  );
}
