import type { BillingUsageDTO } from '@booking/types';
import {
  Pressable,
  Surface,
  SYSTEM_COLORS,
  Text,
  useAppColorScheme,
  useDepth,
} from '@booking/ui';
import { ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formatPrice } from '@/lib/format';

import {
  CATALOG_CURRENCY,
  extraJobRateCents,
  resetsLabel,
  usageView,
} from '../logic';

/**
 * The "Your plan" usage card of PlanBilling.dc.html: plan name, a bar of
 * completed jobs against the allowance, one line of numbers, and (from 80%)
 * an amber warning. Nothing is ever cut off, and the copy says so. With
 * `onPress` the whole card is a link (Reports opens Plans from it).
 */
export function UsageCard({
  usage,
  planName,
  currency = CATALOG_CURRENCY,
  onPress,
}: {
  usage: BillingUsageDTO;
  planName: string;
  /** The catalogue currency (the plans' own `currency`) */
  currency?: string;
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const { isDark } = useAppColorScheme();
  const view = usageView(usage);
  const warn = view.state !== 'normal';
  const fill = warn
    ? SYSTEM_COLORS.orange[isDark ? 'dark' : 'light']
    : depth.colors.tint;
  const rate = formatPrice(extraJobRateCents(usage), currency);
  const resets = resetsLabel(usage.resets_on);

  const line =
    view.state === 'over'
      ? t('plans.usage.lineOver', {
          used: view.used,
          limit: view.limit,
          extra: t('plans.usage.extraJobs', { count: view.extraJobs }),
          amount: formatPrice(view.extraCostCents, currency),
        })
      : t('plans.usage.line', {
          used: view.used,
          limit: view.limit,
          date: resets,
        });

  const body = (
    <Surface variant="raised" radius={26} className="mx-5 mt-5 p-4">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-[20px] font-semibold leading-[25px]">
          {planName}
        </Text>
        {onPress ? (
          <ChevronRight
            size={14}
            strokeWidth={2.8}
            color={depth.colors.secondary}
          />
        ) : (
          <Text
            style={{ color: depth.colors.green }}
            className="text-subtitle font-semibold"
          >
            {t('plans.yourPlan')}
          </Text>
        )}
      </View>
      <Surface
        variant="inset"
        radius={6}
        accessibilityRole="progressbar"
        accessibilityLabel={t('plans.usage.barLabel')}
        accessibilityValue={{ min: 0, max: view.limit, now: view.used }}
        className="mt-3.5 h-3 overflow-hidden"
      >
        <View
          style={{
            width: `${view.fillPercent}%`,
            backgroundColor: fill,
          }}
          className="h-full rounded-md"
        />
      </Surface>
      <Text
        style={{ fontVariant: ['tabular-nums'] }}
        className="mt-2.5 text-title"
      >
        {line}
      </Text>
      {warn ? (
        <>
          <Text
            style={{ color: depth.colors.amber }}
            className="mt-1 text-subtitle font-semibold"
          >
            {t(`plans.usage.${view.state}.title`)}
          </Text>
          <Text className="mt-0.5 text-subtitle text-muted-foreground">
            {t(`plans.usage.${view.state}.body`, { rate, date: resets })}
          </Text>
        </>
      ) : (
        <Text className="mt-0.5 text-subtitle text-muted-foreground">
          {t('plans.usage.reassure')}
        </Text>
      )}
    </Surface>
  );

  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${planName}, ${line}`}
      accessibilityHint={t('plans.usage.openHint')}
    >
      {body}
    </Pressable>
  ) : (
    body
  );
}
