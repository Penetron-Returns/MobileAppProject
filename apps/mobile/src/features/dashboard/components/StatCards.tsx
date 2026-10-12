import type { DashboardSummary } from '@shared/api';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import { useAppColorScheme } from '@/hooks/useAppColorScheme';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

import { buildSparkline } from '../logic';

const CARD =
  'bg-card border-border h-48 flex-1 justify-between rounded-2xl border p-4 shadow-sm';
const LABEL =
  'text-muted-foreground mb-1 text-xs font-bold uppercase tracking-wider';

export function RevenueCard({
  summary,
  currency,
}: {
  summary: DashboardSummary;
  currency: string;
}) {
  const { t } = useTranslation();
  const { colors } = useAppColorScheme();
  const spark = buildSparkline(summary.revenue_by_day.map((d) => d.cents));
  return (
    <View className={CARD}>
      <View>
        <Text className={LABEL}>{t('dashboard.monthlyRevenue')}</Text>
        <Text className="text-foreground text-3xl font-bold">
          {formatMoney(summary.month_revenue_cents, currency, {
            decimals: false,
          })}
        </Text>
      </View>
      {spark ? (
        <View className="h-16 w-full overflow-hidden">
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 100 30"
            preserveAspectRatio="none"
          >
            <Path d={spark.area} fill={colors.primary} fillOpacity={0.12} />
            <Path
              d={spark.line}
              fill="none"
              stroke={colors.primary}
              strokeWidth={2}
            />
          </Svg>
        </View>
      ) : null}
    </View>
  );
}

type CountKey = keyof typeof CHIP_STYLES;

const CHIP_STYLES = {
  confirmed: 'bg-status-confirmed-soft text-status-confirmed',
  checked_in: 'bg-accent text-primary',
  completed: 'bg-status-completed-soft text-status-completed',
  no_show: 'bg-status-pending-soft text-status-pending',
} as const;

const ALWAYS_SHOWN: CountKey[] = ['confirmed', 'completed'];

export function TodayBookingsCard({
  today,
}: {
  today: DashboardSummary['today'];
}) {
  const { t } = useTranslation();
  const keys = (Object.keys(CHIP_STYLES) as CountKey[]).filter(
    (key) => ALWAYS_SHOWN.includes(key) || today[key] > 0,
  );
  return (
    <View className={CARD}>
      <View>
        <Text className={LABEL}>{t('dashboard.todaysBookings')}</Text>
        <Text className="text-foreground text-3xl font-bold">
          {today.total - today.cancelled}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {keys.map((key) => {
          const [bg, fg] = CHIP_STYLES[key].split(' ');
          return (
            <View key={key} className={cn('rounded-full px-2.5 py-1', bg)}>
              <Text className={cn('text-xs font-semibold', fg)}>
                {t(`dashboard.statusCount.${key}`, { count: today[key] })}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
