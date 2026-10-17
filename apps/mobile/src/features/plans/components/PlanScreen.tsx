import type { PlanDTO } from '@booking/types';
import {
  ErrorState,
  Page,
  Reveal,
  Skeleton,
  Surface,
  Text,
  useDepth,
} from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SavedCopyBanner } from '@/components/SavedCopyBanner';
import { useCanManage } from '@/features/business/me';
import { OwnerOnlyNote } from '@/features/settings/components/OwnerOnlyNote';
import { isFailed, loadError } from '@/lib/offline';
import { describeError, toast } from '@/lib/toast';

import { isCheckoutPlan, type CheckoutPlanId } from '../checkout';
import { paidPlans } from '../compare';
import { useBillingUsage, usePlans } from '../hooks';
import { formatRand } from '../logic';
import { useChangePlan, useManageSubscription } from '../useBillingActions';
import { useCheckout } from '../useCheckout';
import {
  BillingRows,
  CheckoutNote,
  CompanionPerks,
  ComparePlans,
  TierCard,
} from './PlanParts';
import { CheckoutStatus } from './CheckoutStatus';
import { UsageCard } from './UsageCard';

/**
 * Plan & billing (PlanBilling.dc.html): the headline, "Your plan" with live
 * usage, three equal tiers, what the companion includes, a comparison and the
 * billing rows. Choosing a plan opens secure checkout (`useStartCheckout`).
 */
export function PlanScreen() {
  const { t } = useTranslation();
  const plans = usePlans();
  const usage = useBillingUsage();
  const refresh = () =>
    Promise.all([plans.refetch(), usage.refetch()]).then(() => undefined);

  return (
    <Page
      title={t('plans.title')}
      backLabel={t('tabs.settings')}
      backFallback="/settings"
      onRefresh={plans.data ? refresh : undefined}
    >
      <SavedCopyBanner query={plans} />
      {isFailed(plans) ? (
        <ErrorState
          variant="banner"
          title={t('plans.error.title')}
          description={t('plans.error.description')}
          {...describeError(loadError(plans))}
          onRetry={() => void plans.refetch()}
        />
      ) : plans.data ? (
        <PlanBody
          plans={plans.data.plans}
          currentPlan={plans.data.current_plan}
          usage={usage}
        />
      ) : (
        <PlanSkeleton />
      )}
    </Page>
  );
}

function PlanBody({
  plans,
  currentPlan,
  usage,
}: {
  plans: PlanDTO[];
  currentPlan: string;
  usage: ReturnType<typeof useBillingUsage>;
}) {
  const { t } = useTranslation();
  const tiers = paidPlans(plans);
  const current = plans.find((p) => p.id === currentPlan);
  const isPaid = Boolean(current?.has_companion);
  const rate = formatRand(tiers[0]?.extra_job_cents ?? 0);
  const canManage = useCanManage();
  // Staff see the plans; choosing one is the owner's call (the API refuses it too).
  const checkout = useCheckout();
  const manage = useManageSubscription();
  const changePlan = useChangePlan();
  const lastPlan = React.useRef<CheckoutPlanId | null>(null);
  const start = (id: CheckoutPlanId) => {
    lastPlan.current = id;
    void checkout.start(id);
  };
  const choose = canManage
    ? (plan: PlanDTO) => {
        if (!isCheckoutPlan(plan.id)) return;
        // A subscriber switches plan; only a first purchase goes through checkout.
        if (isPaid) changePlan.mutate(plan.id);
        else start(plan.id);
      }
    : () => toast.blocked(t('settings.ownerOnly'));
  const { phase } = checkout;

  return (
    <>
      <Reveal scope="plans" index={0}>
        <View className="mx-5 mt-4">
          <Text
            role="heading"
            aria-level="1"
            className="text-[22px] font-bold leading-7"
          >
            {t('plans.headline', { rate })}
          </Text>
          <Text className="mt-1.5 text-subtitle text-muted-foreground">
            {t('plans.subline', { rate })}
          </Text>
        </View>
      </Reveal>

      <Reveal scope="plans" index={1}>
        {isPaid && usage.data ? (
          <UsageCard
            usage={usage.data}
            planName={current?.name ?? t(`plans.names.${currentPlan}`)}
          />
        ) : isPaid ? (
          <CurrentPlanFallback
            name={current?.name ?? ''}
            isLoading={usage.isPending && !isFailed(usage)}
          />
        ) : null}
      </Reveal>

      <Text
        role="heading"
        aria-level="2"
        className="mx-5 mt-6 text-section font-bold"
      >
        {t('plans.tiers')}
      </Text>
      {phase.kind !== 'idle' && phase.kind !== 'active' ? (
        <CheckoutStatus
          phase={phase}
          onRetry={() => lastPlan.current && start(lastPlan.current)}
          onCheckAgain={() => void checkout.checkAgain()}
          onNotPaid={checkout.notPaid}
          onBack={checkout.reset}
        />
      ) : null}
      {tiers.map((plan) => (
        <TierCard key={plan.id} plan={plan} onChoose={choose} />
      ))}
      <CheckoutNote />

      <Text
        role="heading"
        aria-level="2"
        className="mx-5 mt-6 text-section font-bold"
      >
        {t('plans.perksTitle')}
      </Text>
      <CompanionPerks />
      <ComparePlans plans={tiers} />

      <Text
        role="heading"
        aria-level="2"
        className="mx-5 mt-6 text-section font-bold"
      >
        {t('plans.billing.title')}
      </Text>
      <BillingRows
        onManage={isPaid && canManage ? () => manage.mutate() : undefined}
      />
      <OwnerOnlyNote />
    </>
  );
}

/** Paid plan whose usage has not arrived (or failed): the name, without a made-up count. */
function CurrentPlanFallback({
  name,
  isLoading,
}: {
  name: string;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  return (
    <Surface variant="raised" radius={26} className="mx-5 mt-5 p-4">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-[20px] font-semibold leading-[25px]">{name}</Text>
        <Text
          style={{ color: depth.colors.green }}
          className="text-subtitle font-semibold"
        >
          {t('plans.yourPlan')}
        </Text>
      </View>
      {isLoading ? (
        <Skeleton className="mt-3.5 h-4 w-2/3" />
      ) : (
        <Text className="mt-2 text-subtitle text-muted-foreground">
          {t('plans.usage.unavailable')}
        </Text>
      )}
    </Surface>
  );
}

function PlanSkeleton() {
  const { t } = useTranslation();
  return (
    <View
      accessibilityLabel={t('plans.loading')}
      accessibilityState={{ busy: true }}
    >
      <View className="mx-5 mt-4 gap-2">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
      </View>
      {[0, 1, 2].map((i) => (
        <Surface
          key={i}
          variant="raised"
          radius={26}
          className="mx-5 mt-3 gap-2 p-4"
        >
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-9 w-1/2" />
          <Skeleton className="h-12 w-full rounded-full" />
        </Surface>
      ))}
    </View>
  );
}
