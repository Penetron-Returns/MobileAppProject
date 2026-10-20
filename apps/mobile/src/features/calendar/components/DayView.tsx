import {
  haptics,
  Surface,
  Text,
  useAppColorScheme,
  useDepth,
  withAlpha,
} from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  RefreshControl,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { minutesToTime } from '@/lib/time';

import { BLOCK_INSET_PX, focusScrollY } from '../grid';
import {
  columnWidth,
  minutesToPx,
  nowMinute,
  type DayColumn,
  type MinuteSpan,
  type NewBookingPrefill,
} from '../logic';
import { Column, type Ready } from './DayColumns';
import { NowLabel, NowLine } from './NowLine';

const GUTTER = 52;
const HEADER = 56;
/** Matches the header's px-5, so cells stop where the title does. */
const RIGHT_GUTTER = 20;

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

/**
 * Staff columns under staff names, with a time gutter. One vertical scroll view
 * owns everything that moves up and down (the gutter is part of its content, so
 * it can never drift from the grid); the columns scroll sideways inside it only
 * when there are more than two. The staff names sit above and follow the sideways
 * scroll on the UI thread. Off-hours are tinted, a red line marks now.
 */
export function DayView({
  view,
  bottomInset,
  onCreateAt,
}: {
  view: Ready;
  bottomInset: number;
  /** Long-press on an empty slot opens New booking with that staff and time. */
  onCreateAt?: (prefill: NewBookingPrefill) => void;
}) {
  const depth = useDepth();
  const { colors } = useAppColorScheme();
  // The tab is as wide as the window, so the first layout is already right.
  const windowWidth = useWindowDimensions().width;
  const vertical = React.useRef<ScrollView>(null);
  const horizontal = React.useRef<ScrollView>(null);
  const scrollX = useSharedValue(0);
  const [refreshing, setRefreshing] = React.useState(false);

  const { date, columns, window, timezone, closedDay } = view;
  const colWidth = columnWidth(
    windowWidth - GUTTER - RIGHT_GUTTER,
    columns.length,
  );
  const contentWidth = colWidth * columns.length;
  const scrolls = columns.length > 2;
  const height = minutesToPx(window.endMin - window.startMin);

  // Open on the now line (or the first working hour), once per day shown.
  // `contentOffset` places it on the first frame on iOS; Android scrolls after mount.
  const openY = React.useMemo(
    () => {
      const nowMin = nowMinute(new Date(), timezone, date, window);
      return focusScrollY(
        nowMin ?? columns.flatMap((c) => c.working)[0]?.startMin,
        window,
      );
    },
    // Only when the day changes, not on every data refresh or clock tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [date],
  );
  React.useEffect(() => {
    if (Platform.OS === 'ios') return;
    const id = setTimeout(
      () => vertical.current?.scrollTo({ y: openY, animated: false }),
      0,
    );
    return () => clearTimeout(id);
  }, [openY]);

  // A new day or staff list always starts at the first column.
  React.useEffect(() => {
    scrollX.value = 0;
    horizontal.current?.scrollTo({ x: 0, animated: false });
  }, [date, columns.length, scrollX]);

  const onScrollX = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });
  const headerShift = useAnimatedStyle(() => ({
    transform: [{ translateX: -scrollX.value }],
  }));

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await view.refresh();
    } finally {
      setRefreshing(false);
    }
  }, [view]);

  const onLongPressEmpty = React.useMemo(
    () =>
      onCreateAt
        ? (staffId: string, minutes: number) => {
            haptics.light();
            onCreateAt({ staffId, date, time: minutesToTime(minutes) });
          }
        : undefined,
    [onCreateAt, date],
  );

  const grid = (
    <View style={{ width: contentWidth, height }} className="flex-row">
      {columns.map((c) => (
        <Column
          key={c.staff.id}
          staffId={c.staff.id}
          width={colWidth}
          height={height}
          window={window}
          working={c.working}
          blocks={c.blocks}
          closed={closedDay !== null}
          appointments={c.appointments}
          timezone={timezone}
          onLongPressEmpty={onLongPressEmpty}
        />
      ))}
      {closedDay ? <ClosedOverlay name={closedDay.name} /> : null}
      <NowLine date={date} timezone={timezone} window={window} />
    </View>
  );

  return (
    <View className="flex-1">
      <View style={{ height: HEADER }} className="flex-row">
        <View style={{ width: GUTTER }} />
        <View className="flex-1 overflow-hidden">
          <Animated.View
            style={[{ width: contentWidth }, headerShift]}
            className="flex-row"
          >
            <ColumnHeaders columns={columns} width={colWidth} />
          </Animated.View>
        </View>
      </View>
      <ScrollView
        ref={vertical}
        directionalLockEnabled
        overScrollMode="never"
        nestedScrollEnabled
        contentOffset={{ x: 0, y: openY }}
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
        <View style={{ height }} className="flex-row">
          <HourGutter window={window} date={date} timezone={timezone} />
          {scrolls ? (
            <AnimatedScrollView
              ref={horizontal}
              horizontal
              nestedScrollEnabled
              directionalLockEnabled
              bounces={false}
              overScrollMode="never"
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={onScrollX}
              contentOffset={{ x: 0, y: 0 }}
              style={{ flex: 1 }}
            >
              {grid}
            </AnimatedScrollView>
          ) : (
            <View className="flex-1">{grid}</View>
          )}
        </View>
      </ScrollView>
      {view.isRefreshing ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          style={{ backgroundColor: depth.colors.tint }}
          className="absolute left-0 right-0 top-0 h-0.5 opacity-60"
        />
      ) : null}
    </View>
  );
}

const ColumnHeaders = React.memo(function ColumnHeaders({
  columns,
  width,
}: {
  columns: DayColumn<{ id: string; name: string }, unknown>[];
  width: number;
}) {
  const { t } = useTranslation();
  return (
    <>
      {columns.map((c) => (
        <View
          key={c.staff.id}
          style={{ width }}
          accessibilityRole="header"
          className="items-center justify-center px-2"
        >
          <Text numberOfLines={1} className="text-title font-semibold">
            {c.staff.name}
          </Text>
          <Text numberOfLines={1} className="text-meta text-muted-foreground">
            {t('calendar.bookingCount', { count: c.appointments.length })}
          </Text>
        </View>
      ))}
    </>
  );
});

const HourGutter = React.memo(function HourGutter({
  window,
  date,
  timezone,
}: {
  window: MinuteSpan;
  date: Ready['date'];
  timezone: string;
}) {
  const hours: number[] = [];
  for (let m = window.startMin; m < window.endMin; m += 60) hours.push(m);
  return (
    <View
      style={{ width: GUTTER }}
      importantForAccessibility="no-hide-descendants"
    >
      {hours.map((m) => (
        <View
          key={m}
          style={{ height: minutesToPx(60), paddingTop: BLOCK_INSET_PX }}
          className="items-end pr-2"
        >
          <Text
            style={{ fontVariant: ['tabular-nums'] }}
            className="text-meta text-muted-foreground"
          >
            {minutesToTime(m)}
          </Text>
        </View>
      ))}
      <NowLabel date={date} timezone={timezone} window={window} />
    </View>
  );
});

function ClosedOverlay({ name }: { name: string }) {
  const { t } = useTranslation();
  const depth = useDepth();
  return (
    <View
      pointerEvents="none"
      style={{ backgroundColor: withAlpha(depth.colors.label, 0.05) }}
      className="absolute inset-0 items-center pt-[120px]"
    >
      <Surface
        variant="knob"
        radius={18}
        accessibilityRole="alert"
        className="min-h-[38px] justify-center px-4"
      >
        <Text className="text-title font-semibold text-muted-foreground">
          {t('calendar.closedDay', { name })}
        </Text>
      </Surface>
    </View>
  );
}
