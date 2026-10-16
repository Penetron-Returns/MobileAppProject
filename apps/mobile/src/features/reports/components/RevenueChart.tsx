import { haptics, Text, useDepth, withAlpha } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';

import { currencySymbol, formatMoney } from '@/lib/format';
import type { ISODate } from '@/lib/time';

import type { RevenueBar } from '../aggregate';
import { axisTicks, barHeight, compactMoney, niceMax } from '../chart';
import { bucketLabel, bucketTitle, type ReportRange } from '../period';

const PLOT_TOP = 44;
const PLOT_HEIGHT = 168;
const LABEL_ROW = 26;
const AXIS_WIDTH = 46;
const CALLOUT_WIDTH = 110;
const MAX_BAR_WIDTH = 30;
const LABEL_WIDTH = 32;

/** The bar to start on: today's, which is the last one except in a week. */
export function defaultBar(
  bars: readonly RevenueBar[],
  today: ISODate,
): number {
  const i = bars.findIndex((b) => b.key > today);
  return Math.max((i === -1 ? bars.length : i) - 1, 0);
}

/**
 * Revenue per day (week, month) or per month (year), drawn with plain views
 * like the Reports board: hairline gridlines with compact amounts on the
 * right, muted bars, the selected bar at full strength with a rule up to a
 * raised callout.
 */
export function RevenueChart({
  bars,
  range,
  currency,
  today,
}: {
  bars: readonly RevenueBar[];
  range: ReportRange;
  currency: string;
  today: ISODate;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const [width, setWidth] = React.useState(0);
  const [picked, setPicked] = React.useState<number | null>(null);
  const selected = Math.min(picked ?? defaultBar(bars, today), bars.length - 1);
  const plotWidth = Math.max(width - AXIS_WIDTH, 0);
  const axisMax = niceMax(Math.max(0, ...bars.map((b) => b.cents)));
  const slot = bars.length > 0 ? plotWidth / bars.length : 0;
  const barWidth = Math.min(slot * 0.62, MAX_BAR_WIDTH);
  const grid = withAlpha(depth.colors.label, 0.16);
  const symbol = currencySymbol(currency);
  const bar = bars[selected];
  if (!bar) return null;

  const unit = t(
    range === 'year' ? 'reports.chart.unitMonth' : 'reports.chart.unitDay',
  );
  const centre = selected * slot + slot / 2;
  const callout = Math.max(
    0,
    Math.min(plotWidth - CALLOUT_WIDTH, centre - CALLOUT_WIDTH / 2),
  );
  const ruleHeight = PLOT_HEIGHT - barHeight(bar.cents, axisMax, PLOT_HEIGHT);

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={t('reports.chart.label', { unit })}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={{ height: PLOT_TOP + PLOT_HEIGHT + LABEL_ROW }}
      className="mt-3"
    >
      {axisTicks(axisMax).map((tick) => {
        const y = PLOT_TOP + (1 - tick / axisMax) * PLOT_HEIGHT;
        return (
          <React.Fragment key={tick}>
            <View
              style={{ top: y, width: plotWidth, backgroundColor: grid }}
              className="absolute left-0 h-[0.5px]"
            />
            <Text
              style={{
                top: y - 9,
                width: AXIS_WIDTH - 6,
                fontVariant: ['tabular-nums'],
              }}
              className="absolute text-meta text-muted-foreground"
              numberOfLines={1}
              // Gridline labels are decoration: the bars carry the values.
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              {compactMoney(tick, symbol)}
            </Text>
          </React.Fragment>
        );
      })}
      <View
        style={{
          left: centre - 0.5,
          top: PLOT_TOP,
          height: ruleHeight,
          backgroundColor: withAlpha(depth.colors.label, 0.35),
        }}
        className="absolute w-px"
      />
      <View
        style={[
          depth.button,
          { left: callout, width: CALLOUT_WIDTH, borderRadius: 10 },
        ]}
        className="absolute top-0 h-11 justify-center px-2.5"
      >
        <Text numberOfLines={1} className="text-meta text-muted-foreground">
          {bucketTitle(bar.key, range)}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontVariant: ['tabular-nums'] }}
          className="text-title font-bold"
        >
          {formatMoney(bar.cents, currency, { decimals: false })}
        </Text>
      </View>
      <View
        style={{ top: PLOT_TOP, height: PLOT_HEIGHT, width: plotWidth }}
        className="absolute left-0 flex-row"
      >
        {bars.map((b, i) => (
          <Pressable
            key={b.key}
            onPress={() => {
              haptics.selection();
              setPicked(i);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('reports.chart.bar', {
              date: bucketTitle(b.key, range),
              amount: formatMoney(b.cents, currency, { decimals: false }),
            })}
            accessibilityState={{ selected: i === selected }}
            className="flex-1 items-center justify-end"
          >
            <View
              style={{
                width: barWidth,
                height: barHeight(b.cents, axisMax, PLOT_HEIGHT),
                backgroundColor: depth.colors.tint,
                opacity: i === selected ? 1 : 0.42,
              }}
              className="rounded-b-[2px] rounded-t-[5px]"
            />
          </Pressable>
        ))}
      </View>
      {bars.map((b, i) => {
        const label = bucketLabel(b.key, range);
        // Wide centred boxes: a two digit day must not be cut to fit a thin slot.
        return label ? (
          <Text
            key={b.key}
            numberOfLines={1}
            style={{
              top: PLOT_TOP + PLOT_HEIGHT + 4,
              left: i * slot + slot / 2 - LABEL_WIDTH / 2,
              width: LABEL_WIDTH,
              fontVariant: ['tabular-nums'],
            }}
            className="absolute text-center text-meta text-muted-foreground"
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {label}
          </Text>
        ) : null;
      })}
    </View>
  );
}
