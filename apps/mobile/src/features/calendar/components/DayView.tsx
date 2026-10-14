import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  RefreshControl,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';

import { Text } from '@/components/ui/text';
import { useAppColorScheme } from '@/hooks/useAppColorScheme';
import { useDepth } from '@/hooks/useDepth';
import { withAlpha } from '@/lib/depth';
import { minutesToTime, type ISODate } from '@/lib/time';

import type { CalendarDayView } from '../hooks';
import {
  appointmentSpan,
  columnWidth,
  complementSpans,
  minutesToPx,
  nowMinute,
  type MinuteSpan,
} from '../logic';
import { AppointmentBlock } from './AppointmentBlock';
import { Hatch } from './Hatch';

const GUTTER = 52;
const HEADER = 56;
const MIN_BLOCK = 36;
const NOW_RED = '#FF3B30';

type Ready = Extract<CalendarDayView, { status: 'ready' }>;

/**
 * Staff columns under sticky staff names, with a time gutter that stays put
 * while the grid scrolls sideways. Off-hours are hatched, a red line marks now.
 */
export function DayView({
  view,
  date,
  bottomInset,
}: {
  view: Ready;
  date: ISODate;
  bottomInset: number;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const { colors } = useAppColorScheme();
  const { width } = useWindowDimensions();
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const vertical = React.useRef<ScrollView>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const { columns, window, timezone, now } = view;
  const colWidth = columnWidth(width - GUTTER, columns.length);
  const height = minutesToPx(window.endMin - window.startMin);
  const nowMin = nowMinute(now, timezone, date, window);
  const top = (min: number) => minutesToPx(min - window.startMin);

  // Open on the now line (or the first working hour) once per day shown.
  React.useEffect(() => {
    const focus = nowMin ?? columns.flatMap((c) => c.working)[0]?.startMin;
    const y = focus === undefined ? 0 : Math.max(top(focus) - 120, 0);
    const id = setTimeout(
      () => vertical.current?.scrollTo({ y, animated: false }),
      0,
    );
    return () => clearTimeout(id);
    // Only when the day changes, not on every minute tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await view.refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const hours: number[] = [];
  for (let m = window.startMin; m < window.endMin; m += 60) hours.push(m);

  return (
    <View className="flex-1 flex-row">
      <View style={{ width: GUTTER }} className="overflow-hidden">
        <View style={{ height: HEADER }} />
        <View className="flex-1 overflow-hidden">
          <Animated.View
            style={{
              transform: [{ translateY: Animated.multiply(scrollY, -1) }],
            }}
            importantForAccessibility="no-hide-descendants"
          >
            {hours.map((m, index) => (
              <View
                key={m}
                style={{ height: minutesToPx(60) }}
                className="items-end pr-2"
              >
                <Text
                  style={{
                    fontVariant: ['tabular-nums'],
                    marginTop: index === 0 ? 0 : -8,
                  }}
                  className="text-meta text-muted-foreground"
                >
                  {minutesToTime(m)}
                </Text>
              </View>
            ))}
            {nowMin !== null ? (
              <Text
                style={{
                  position: 'absolute',
                  right: 6,
                  top: top(nowMin) - 9,
                  color: '#FFFFFF',
                  backgroundColor: NOW_RED,
                  fontVariant: ['tabular-nums'],
                }}
                className="overflow-hidden rounded-md px-1 text-meta font-semibold"
              >
                {minutesToTime(nowMin)}
              </Text>
            ) : null}
          </Animated.View>
        </View>
      </View>

      <ScrollView horizontal nestedScrollEnabled className="flex-1">
        <View style={{ width: colWidth * columns.length }}>
          <Animated.ScrollView
            ref={vertical as React.Ref<never>}
            nestedScrollEnabled
            stickyHeaderIndices={[0]}
            scrollEventThrottle={16}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: true },
            )}
            contentContainerStyle={{ paddingBottom: bottomInset }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
          >
            <View
              style={{
                height: HEADER,
                backgroundColor: depth.ground.backgroundColor,
              }}
              className="flex-row"
            >
              {columns.map((c) => (
                <View
                  key={c.staff.id}
                  style={{ width: colWidth }}
                  accessibilityRole="header"
                  className="items-center justify-center px-2"
                >
                  <Text numberOfLines={1} className="text-title font-semibold">
                    {c.staff.name}
                  </Text>
                  <Text
                    numberOfLines={1}
                    className="text-meta text-muted-foreground"
                  >
                    {t('calendar.bookingCount', {
                      count: c.appointments.length,
                    })}
                  </Text>
                </View>
              ))}
            </View>

            <View style={{ height }} className="flex-row">
              {columns.map((c, index) => (
                <Column
                  key={c.staff.id}
                  width={colWidth}
                  height={height}
                  window={window}
                  working={c.working}
                  appointments={c.appointments}
                  timezone={timezone}
                  hasDivider={index > 0}
                />
              ))}
              <HourLines hours={hours} window={window} />
              {nowMin !== null ? (
                <View
                  pointerEvents="none"
                  style={{ top: top(nowMin), backgroundColor: NOW_RED }}
                  className="absolute left-0 right-0 h-0.5"
                />
              ) : null}
            </View>
          </Animated.ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

function HourLines({ hours, window }: { hours: number[]; window: MinuteSpan }) {
  const depth = useDepth();
  return (
    <>
      {hours.map((m) => (
        <View
          key={m}
          pointerEvents="none"
          style={{
            top: minutesToPx(m - window.startMin),
            backgroundColor: withAlpha(depth.colors.label, 0.07),
          }}
          className="absolute left-0 right-0 h-px"
        />
      ))}
    </>
  );
}

function Column({
  width,
  height,
  window,
  working,
  appointments,
  timezone,
  hasDivider,
}: {
  width: number;
  height: number;
  window: MinuteSpan;
  working: MinuteSpan[];
  appointments: Ready['columns'][number]['appointments'];
  timezone: string;
  hasDivider: boolean;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const off = complementSpans(working, window);
  const top = (min: number) => minutesToPx(min - window.startMin);
  return (
    <View
      style={{
        width,
        height,
        borderLeftWidth: hasDivider ? 1 : 0,
        borderLeftColor: withAlpha(depth.colors.label, 0.07),
      }}
    >
      {off.map((span) => {
        const spanHeight = minutesToPx(span.endMin - span.startMin);
        return (
          <View
            key={span.startMin}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              top: top(span.startMin),
              width,
              height: spanHeight,
            }}
          >
            <Hatch width={width} height={spanHeight} />
          </View>
        );
      })}
      {working.length === 0 ? (
        <Text
          style={{ position: 'absolute', top: 12, left: 0, right: 0 }}
          className="text-center text-meta font-semibold text-muted-foreground"
        >
          {t('calendar.dayOff')}
        </Text>
      ) : null}
      {appointments.map((a) => {
        const span = appointmentSpan(a, timezone);
        return (
          <View
            key={a.id}
            style={{
              position: 'absolute',
              left: 4,
              right: 4,
              top: top(span.startMin),
            }}
          >
            <AppointmentBlock
              appointment={a}
              timezone={timezone}
              height={Math.max(
                minutesToPx(span.endMin - span.startMin) - 2,
                MIN_BLOCK,
              )}
            />
          </View>
        );
      })}
    </View>
  );
}
