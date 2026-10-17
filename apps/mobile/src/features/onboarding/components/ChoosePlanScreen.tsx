import type { PlanDTO } from '@booking/types';
import { Button, ErrorState, Skeleton, Surface, Text } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { paidPlans } from '@/features/plans/compare';
import { isCheckoutPlan, type CheckoutPlanId } from '@/features/plans/checkout';
import { CheckoutStatus } from '@/features/plans/components/CheckoutStatus';
import { usePlans } from '@/features/plans/hooks';
import { formatRand } from '@/features/plans/logic';
import { useCheckout } from '@/features/plans/useCheckout';
import { describeError } from '@/lib/toast';

import { OnboardingFrame } from './OnboardingFrame';

/**
 * "Choose a plan": three big cards and no free option. Start opens secure
 * checkout in the in-app browser; the screen then waits for the payment to
 * land, and the app routes on by itself once the plan is active.
 */
export function ChoosePlanScreen() {
  const { t } = useTranslation();
  const plans = usePlans();
  const checkout = useCheckout();
  const [chosen, setChosen] = React.useState<CheckoutPlanId | null>(null);
  const tiers = paidPlans(plans.data?.plans ?? []).filter((p) =>
    isCheckoutPlan(p.id),
  );

  const start = (id: CheckoutPlanId) => {
    setChosen(id);
    void checkout.start(id);
  };
  const spoken = [
    t('onboarding.plan.title'),
    ...tiers.map((p) =>
      t('onboarding.plan.spokenPlan', {
        name: p.name,
        price: formatRand(p.price_cents),
        count: p.included_jobs ?? 0,
      }),
    ),
  ].join(' ');

  let body: React.ReactNode;
  const { phase } = checkout;
  if (phase.kind !== 'idle' && phase.kind !== 'active') {
    body = (
      <CheckoutStatus
        phase={phase}
        onRetry={() => chosen && start(chosen)}
        onCheckAgain={() => void checkout.checkAgain()}
        onNotPaid={checkout.notPaid}
        onBack={checkout.reset}
      />
    );
  } else if (plans.isError) {
    body = (
      <View className="mx-5">
        <ErrorState
          variant="banner"
          title={t('onboarding.plan.loadFailed')}
          {...describeError(plans.error)}
          onRetry={() => void plans.refetch()}
        />
      </View>
    );
  } else if (!plans.data) {
    body = (
      <View
        className="mx-5 gap-3"
        accessibilityLabel={t('onboarding.plan.loading')}
        accessibilityState={{ busy: true }}
      >
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-[26px]" />
        ))}
      </View>
    );
  } else {
    body = (
      <View className="gap-3 px-5">
        {tiers.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onStart={() => isCheckoutPlan(plan.id) && start(plan.id)}
          />
        ))}
      </View>
    );
  }

  return (
    <OnboardingFrame
      stage={3}
      title={t('onboarding.plan.title')}
      spoken={spoken}
    >
      {body}
    </OnboardingFrame>
  );
}

function PlanCard({ plan, onStart }: { plan: PlanDTO; onStart: () => void }) {
  const { t } = useTranslation();
  const price = formatRand(plan.price_cents);
  return (
    <Surface variant="raised" radius={26} className="gap-1 p-5">
      <Text className="text-section font-semibold">{plan.name}</Text>
      <Text
        style={{ fontVariant: ['tabular-nums'] }}
        className="text-large-title font-bold"
      >
        {t('onboarding.plan.perMonth', { price })}
      </Text>
      <Text className="text-title">
        {t('onboarding.plan.bookings', { count: plan.included_jobs ?? 0 })}
      </Text>
      <Text className="text-title text-muted-foreground">
        {t('onboarding.plan.extra', {
          price: formatRand(plan.extra_job_cents ?? 0),
        })}
      </Text>
      <Button
        size="xl"
        className="mt-3"
        onPress={onStart}
        accessibilityLabel={t('onboarding.plan.startNamed', {
          name: plan.name,
          price,
        })}
      >
        <Text>{t('onboarding.plan.start')}</Text>
      </Button>
    </Surface>
  );
}
