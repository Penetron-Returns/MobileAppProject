import type { PlanChangePreviewDTO, PlanDTO } from '@booking/types';
import {
  Button,
  IconButton,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  SuccessMark,
  Text,
  useDepth,
  useReduceMotion,
} from '@booking/ui';
import { X } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, findNodeHandle, View } from 'react-native';

import { useBusiness } from '@/features/business/hooks';

import { isCheckoutPlan } from '../checkout';
import { planChangeAmounts } from '../planChange';
import { useManageSubscription } from '../useBillingActions';
import { usePlanChange, usePlanPreview } from '../usePlanChange';

const DEFAULT_TZ = 'Africa/Johannesburg';
/** The sheet body keeps this height from skeleton to copy, so nothing jumps. */
const BODY_MIN_HEIGHT = 96;
const SUCCESS_CLOSE_MS = 900;

/**
 * Confirmation before a plan changes: loads what it will cost, says it in one
 * sentence and only then changes the plan. `plan` is the tier the owner
 * tapped; null keeps the sheet closed.
 */
export function PlanChangeSheet({
  plan,
  currentName,
  onClose,
}: {
  plan: PlanDTO | null;
  currentName: string;
  onClose: () => void;
}) {
  return (
    <Sheet open={plan !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        {plan ? (
          <PlanChangeBody
            plan={plan}
            currentName={currentName}
            onClose={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function PlanChangeBody({
  plan,
  currentName,
  onClose,
}: {
  plan: PlanDTO;
  currentName: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const reduceMotion = useReduceMotion();
  const business = useBusiness();
  const timezone = business.data?.timezone ?? DEFAULT_TZ;
  const preview = usePlanPreview(isCheckoutPlan(plan.id) ? plan.id : null);
  const { phase, confirm } = usePlanChange(onClose);
  const manage = useManageSubscription();
  const titleRef = React.useRef<View>(null);
  const data = preview.data;
  const isBusy = phase === 'working' || phase === 'confirming';

  // Same plan: nothing to confirm.
  React.useEffect(() => {
    if (data?.direction === 'same') onClose();
  }, [data?.direction, onClose]);

  // Move the screen reader to the title once the sheet has settled.
  React.useEffect(() => {
    if (!data) return;
    const timer = setTimeout(() => {
      const node = titleRef.current && findNodeHandle(titleRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 350);
    return () => clearTimeout(timer);
  }, [data]);

  React.useEffect(() => {
    if (phase !== 'success') return;
    const timer = setTimeout(onClose, reduceMotion ? 400 : SUCCESS_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [phase, onClose, reduceMotion]);

  return (
    <View>
      <View className="absolute right-0 top-0 z-10">
        <IconButton
          icon={X}
          label={t('plans.change.close')}
          variant="plain"
          size="sm"
          disabled={isBusy}
          onPress={onClose}
        />
      </View>
      {phase === 'success' ? (
        <View
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={t('plans.change.done')}
          style={{ minHeight: BODY_MIN_HEIGHT }}
          className="items-center justify-center gap-2 py-4"
        >
          <SuccessMark size={56} />
          <Text className="text-title font-semibold">
            {t('plans.change.done')}
          </Text>
        </View>
      ) : data && data.direction !== 'same' ? (
        <Loaded
          preview={data}
          plan={plan}
          currentName={currentName}
          timezone={timezone}
          titleRef={titleRef}
        />
      ) : (
        <Pending
          failed={preview.isError}
          onRetry={() => void preview.refetch()}
        />
      )}
      {phase === 'declined' || phase === 'failed' ? (
        <Text
          accessibilityRole="alert"
          style={{ color: depth.colors.red }}
          className="mt-3 text-subtitle"
        >
          {t(
            phase === 'declined'
              ? 'plans.change.declined'
              : 'plans.change.failed',
          )}
        </Text>
      ) : null}
      {phase !== 'success' && data && data.direction !== 'same' ? (
        <Actions
          preview={data}
          timezone={timezone}
          phase={phase}
          onConfirm={() => void confirm(data)}
          onCancel={onClose}
          onUpdateCard={() => manage.mutate()}
        />
      ) : null}
    </View>
  );
}

function Pending({
  failed,
  onRetry,
}: {
  failed: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  if (failed) {
    return (
      <View style={{ minHeight: BODY_MIN_HEIGHT }} className="gap-3">
        <Text accessibilityRole="alert" className="text-subtitle">
          {t('plans.change.loadFailed')}
        </Text>
        <Button variant="secondary" size="lg" onPress={onRetry}>
          <Text>{t('common.retry')}</Text>
        </Button>
      </View>
    );
  }
  return (
    <View
      accessibilityLabel={t('plans.change.loading')}
      accessibilityState={{ busy: true }}
      style={{ minHeight: BODY_MIN_HEIGHT }}
      className="gap-2.5"
    >
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </View>
  );
}

function Loaded({
  preview,
  plan,
  currentName,
  timezone,
  titleRef,
}: {
  preview: PlanChangePreviewDTO;
  plan: PlanDTO;
  currentName: string;
  timezone: string;
  titleRef: React.RefObject<View | null>;
}) {
  const { t } = useTranslation();
  const amounts = planChangeAmounts(preview, timezone);
  const isUpgrade = preview.direction === 'upgrade';
  const body = isUpgrade
    ? t(
        preview.amount_due_now_cents > 0
          ? 'plans.change.upgradeBody'
          : 'plans.change.upgradeBodyFree',
        amounts,
      )
    : t('plans.change.downgradeBody', { current: currentName });
  return (
    <SheetHeader style={{ minHeight: BODY_MIN_HEIGHT }} className="pr-10">
      <View ref={titleRef} accessible accessibilityRole="header">
        <SheetTitle>
          {isUpgrade
            ? t('plans.change.upgradeTitle', { name: plan.name })
            : t('plans.change.downgradeTitle', {
                name: plan.name,
                date: amounts.date,
              })}
        </SheetTitle>
      </View>
      <SheetDescription>{body}</SheetDescription>
    </SheetHeader>
  );
}

function Actions({
  preview,
  timezone,
  phase,
  onConfirm,
  onCancel,
  onUpdateCard,
}: {
  preview: PlanChangePreviewDTO;
  timezone: string;
  phase: ReturnType<typeof usePlanChange>['phase'];
  onConfirm: () => void;
  onCancel: () => void;
  onUpdateCard: () => void;
}) {
  const { t } = useTranslation();
  const amounts = planChangeAmounts(preview, timezone);
  const isBusy = phase === 'working' || phase === 'confirming';
  const isUpgrade = preview.direction === 'upgrade';
  const label = isUpgrade
    ? t(
        preview.amount_due_now_cents > 0
          ? 'plans.change.upgradeConfirm'
          : 'plans.change.upgradeConfirmFree',
        amounts,
      )
    : t('plans.change.downgradeConfirm', amounts);
  const shownLabel =
    phase === 'confirming' ? t('plans.change.confirming') : label;
  return (
    <View className="mt-4 gap-2.5">
      {phase === 'declined' ? (
        <Button variant="secondary" size="lg" onPress={onUpdateCard}>
          <Text>{t('plans.change.updateCard')}</Text>
        </Button>
      ) : null}
      <Button
        size="lg"
        loading={isBusy}
        accessibilityLabel={shownLabel}
        onPress={onConfirm}
      >
        <Text>{shownLabel}</Text>
      </Button>
      <Button variant="ghost" size="lg" disabled={isBusy} onPress={onCancel}>
        <Text>{t('plans.change.notNow')}</Text>
      </Button>
    </View>
  );
}
