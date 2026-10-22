import type { DashboardSummary } from '@booking/types';
import {
  AnimatedNumber,
  Capsule,
  Surface,
  Text,
  useDepth,
  type CapsuleTone,
} from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { formatMoney } from '@/lib/format';

import { buildSparkline } from '../logic';

const CARD_CLASS = 'h-48 flex-1 justify-between p-4';

export function RevenueCard({
  summary,
  currency,
}: {
  summary: DashboardSummary;
  currency: string;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const spark = buildSparkline(summary.revenue_by_day.map((d) => d.cents));
  return (
    <Surface variant="raised" radius={22} className={CARD_CLASS}>
      <View>
        <Text className="text-subtitle font-semibold text-muted-foreground">
          {t('dashboard.monthlyRevenue')}
        </Text>
        <AnimatedNumber
          value={summary.month_revenue_cents}
          format={(cents) => formatMoney(cents, currency, { decimals: false })}
          className="mt-0.5 text-[28px] font-bold leading-[34px]"
        />
      </View>
      {spark ? (
        <View className="h-16 w-full overflow-hidden">
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 100 30"
            preserveAspectRatio="none"
          >
            <Path d={spark.area} fill={depth.colors.tint} fillOpacity={0.12} />
            <Path
              d={spark.line}
              fill="none"
              stroke={depth.colors.tint}
              strokeWidth={2}
            />
          </Svg>
        </View>
      ) : null}
    </Surface>
  );
}

const CHIP_TONES = {
  confirmed: 'neutral',
  checked_in: 'green',
  completed: 'grey',
  no_show: 'amber',
} as const satisfies Record<string, CapsuleTone>;

type CountKey = keyof typeof CHIP_TONES;

const ALWAYS_SHOWN: CountKey[] = ['confirmed', 'completed'];

export function TodayBookingsCard({
  today,
}: {
  today: DashboardSummary['today'];
}) {
  const { t } = useTranslation();
  const keys = (Object.keys(CHIP_TONES) as CountKey[]).filter(
    (key) => ALWAYS_SHOWN.includes(key) || today[key] > 0,
  );
  return (
    <Surface variant="raised" radius={22} className={CARD_CLASS}>
      <View>
        <Text className="text-subtitle font-semibold text-muted-foreground">
          {t('dashboard.todaysBookings')}
        </Text>
        <Text
          style={{ fontVariant: ['tabular-nums'] }}
          className="mt-0.5 text-[28px] font-bold leading-[34px]"
        >
          {today.total - today.cancelled}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {keys.map((key) => (
          <Capsule
            key={key}
            tone={CHIP_TONES[key]}
            label={t(`dashboard.statusCount.${key}`, { count: today[key] })}
          />
        ))}
      </View>
    </Surface>
  );
}
