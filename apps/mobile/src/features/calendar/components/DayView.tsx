import { Text, useAppColorScheme, useDepth } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  RefreshControl,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { minutesToTime, type ISODate } from '@/lib/time';
import { columnWidth, minutesToPx, nowMinute } from '../logic';
import { Column, HourLines, type Ready } from './DayColumns';

const GUTTER = 52;
const HEADER = 56;

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
                  color: depth.colors.onFill,
                  backgroundColor: depth.colors.red,
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
                  style={{
                    top: top(nowMin),
                    backgroundColor: depth.colors.red,
                  }}
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
