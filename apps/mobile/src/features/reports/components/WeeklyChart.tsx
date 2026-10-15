import type { WeeklyJobsDTO } from '@booking/types';
import { haptics, Pressable, Text, useDepth, withAlpha } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { ISODate } from '@/lib/time';

import { chartBars, defaultSelection } from '../logic';

const PLOT_HEIGHT = 120;

/**
 * Completed jobs per week, drawn with plain views (PipReport.dc.html's bar
 * chart, simplified): muted bars, the current week at full strength, and a
 * single callout for the tapped bar. The only labels are the week starts
 * and one line for the selection, so nothing competes with the shape.
 */
export function WeeklyChart({
  weekly,
  today,
}: {
  weekly: readonly WeeklyJobsDTO[];
  today: ISODate;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const { bars } = React.useMemo(
    () => chartBars(weekly, PLOT_HEIGHT, today),
    [weekly, today],
  );
  const [picked, setPicked] = React.useState<number | null>(null);
  const selected = Math.min(
    picked ?? defaultSelection(weekly, today),
    Math.max(bars.length - 1, 0),
  );
  const bar = bars[selected];
  if (!bar) return null;

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={t('reports.chart.label')}
      className="mt-3"
    >
      <Text
        style={{ fontVariant: ['tabular-nums'] }}
        className="text-subtitle text-muted-foreground"
      >
        {t('reports.chart.callout', { date: bar.label, count: bar.jobs })}
      </Text>
      <View
        style={{
          height: PLOT_HEIGHT,
          borderBottomColor: withAlpha(depth.colors.label, 0.16),
        }}
        className="mt-2 flex-row items-end gap-2 border-b-[0.5px]"
      >
        {bars.map((b, i) => (
          <Pressable
            key={b.weekStart}
            onPress={() => {
              haptics.selection();
              setPicked(i);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('reports.chart.bar', {
              date: b.label,
              count: b.jobs,
            })}
            accessibilityState={{ selected: i === selected }}
            style={{ height: PLOT_HEIGHT }}
            className="flex-1 justify-end"
            hitSlop={{ top: 8, bottom: 8 }}
          >
            <View
              style={{
                height: b.height,
                backgroundColor: depth.colors.tint,
                opacity: b.isCurrent || i === selected ? 1 : 0.42,
              }}
              className="rounded-b-[2px] rounded-t-[5px]"
            />
          </Pressable>
        ))}
      </View>
      <View className="mt-1 flex-row gap-2">
        {bars.map((b) => (
          <Text
            key={b.weekStart}
            numberOfLines={1}
            style={{ fontVariant: ['tabular-nums'] }}
            className="flex-1 text-center text-meta text-muted-foreground"
          >
            {b.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
