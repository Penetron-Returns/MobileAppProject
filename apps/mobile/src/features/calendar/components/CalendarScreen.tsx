import { useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ground } from '@/components/Ground';
import { OfflineBanner } from '@/components/OfflineBanner';
import { RetryCard } from '@/components/RetryCard';
import { Surface } from '@/components/Surface';
import {
  INBOX_DOME_CLEARANCE,
  tabBarClearance,
} from '@/components/tab-bar/layout';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useBusiness } from '@/features/business/hooks';
import { useAppColorScheme } from '@/hooks/useAppColorScheme';
import { useDepth } from '@/hooks/useDepth';
import {
  WEEKDAYS,
  formatDateLong,
  formatWeekRange,
  startOfWeek,
  todayISO,
  weekdayOf,
  type ISODate,
} from '@/lib/time';
import { cn } from '@/lib/utils';

import { useCalendarDay, useCalendarWeek } from '../hooks';
import { shiftAnchor, weekStrip } from '../logic';
import {
  subscribeCalendarViewMode,
  type CalendarViewMode,
} from '../navigation';
import { DayView } from './DayView';
import { WeekView } from './WeekView';

const VIEWS: CalendarViewMode[] = ['day', 'week'];

function isView(value: unknown): value is CalendarViewMode {
  return typeof value === 'string' && (VIEWS as string[]).includes(value);
}

/** Calendar tab: a day (staff columns) or a read-only week. */
export function CalendarScreen() {
  const { t } = useTranslation();
  const business = useBusiness();
  const insets = useSafeAreaInsets();
  const tz = business.data?.timezone;
  return (
    <Ground className="flex-1">
      <View style={{ paddingTop: insets.top + 8 }} className="flex-1">
        {tz ? (
          <CalendarContent timezone={tz} />
        ) : business.isError ? (
          <RetryCard
            title={t('calendar.error.title')}
            description={t('calendar.error.description')}
            error={business.error}
            onRetry={() => void business.refetch()}
          />
        ) : (
          <CalendarSkeleton />
        )}
      </View>
    </Ground>
  );
}

function CalendarSkeleton() {
  const { t } = useTranslation();
  return (
    <View
      accessibilityLabel={t('calendar.loading')}
      accessibilityState={{ busy: true }}
    >
      <Surface variant="raised" className="mx-5 mt-5 gap-3 p-4">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </Surface>
    </View>
  );
}

function CalendarContent({ timezone }: { timezone: string }) {
  const params = useLocalSearchParams<{ view?: string; t?: string }>();
  const [view, setView] = React.useState<CalendarViewMode>('day');
  const [anchor, setAnchor] = React.useState<ISODate>(() => todayISO(timezone));

  React.useEffect(
    () =>
      subscribeCalendarViewMode((mode) => {
        setView(mode);
        if (mode === 'day') setAnchor(todayISO(timezone));
      }),
    [timezone],
  );
  React.useEffect(() => {
    if (!isView(params.view)) return;
    setView(params.view);
    if (params.view === 'day') setAnchor(todayISO(timezone));
  }, [params.view, params.t, timezone]);

  return (
    <View className="flex-1">
      <CalendarHeader
        view={view}
        anchor={anchor}
        today={todayISO(timezone)}
        onViewChange={setView}
        onAnchor={setAnchor}
        onShift={(dir) => setAnchor((a) => shiftAnchor(view, a, dir))}
      />
      {view === 'day' ? (
        <DayBody date={anchor} />
      ) : (
        <WeekBody
          anchor={anchor}
          onOpenDay={(date) => {
            setAnchor(date);
            setView('day');
          }}
        />
      )}
    </View>
  );
}

function useBottomInset() {
  const insets = useSafeAreaInsets();
  return tabBarClearance(insets.bottom) + INBOX_DOME_CLEARANCE;
}

function DayBody({ date }: { date: ISODate }) {
  const { t } = useTranslation();
  const view = useCalendarDay(date);
  const bottomInset = useBottomInset();
  if (view.status === 'loading') return <CalendarSkeleton />;
  if (view.status === 'error') {
    return (
      <RetryCard
        title={t('calendar.error.title')}
        description={t('calendar.error.description')}
        error={view.error}
        onRetry={view.retry}
      />
    );
  }
  return (
    <View className="flex-1">
      {view.isOffline ? <OfflineBanner label={t('calendar.offline')} /> : null}
      {view.columns.length === 0 ? (
        <Text className="mx-5 mt-6 text-title text-muted-foreground">
          {t('calendar.noStaff')}
        </Text>
      ) : (
        <DayView view={view} date={date} bottomInset={bottomInset} />
      )}
    </View>
  );
}

function WeekBody({
  anchor,
  onOpenDay,
}: {
  anchor: ISODate;
  onOpenDay: (date: ISODate) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useAppColorScheme();
  const view = useCalendarWeek(anchor);
  const bottomInset = useBottomInset();
  const [refreshing, setRefreshing] = React.useState(false);
  const refresh = view.status === 'ready' ? view.refresh : null;
  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: bottomInset }}
      refreshControl={
        refresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              try {
                await refresh();
              } finally {
                setRefreshing(false);
              }
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        ) : undefined
      }
    >
      <View className="w-full max-w-2xl self-center">
        {view.status === 'loading' ? <CalendarSkeleton /> : null}
        {view.status === 'error' ? (
          <RetryCard
            title={t('calendar.error.title')}
            description={t('calendar.error.description')}
            error={view.error}
            onRetry={view.retry}
          />
        ) : null}
        {view.status === 'ready' ? (
          <>
            {view.isOffline ? (
              <OfflineBanner label={t('calendar.offline')} />
            ) : null}
            <WeekView view={view} anchor={anchor} onOpenDay={onOpenDay} />
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

function CalendarHeader({
  view,
  anchor,
  today,
  onViewChange,
  onAnchor,
  onShift,
}: {
  view: CalendarViewMode;
  anchor: ISODate;
  today: ISODate;
  onViewChange: (view: CalendarViewMode) => void;
  onAnchor: (date: ISODate) => void;
  onShift: (direction: 1 | -1) => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const title =
    view === 'week'
      ? formatWeekRange(startOfWeek(anchor))
      : formatDateLong(anchor);
  const caption =
    view === 'week' ? t('calendar.weekView') : WEEKDAYS[weekdayOf(anchor)];
  return (
    <View className="px-5 pb-2">
      <View className="flex-row items-end justify-between">
        <View className="min-w-0 flex-1">
          <Text className="text-subtitle font-semibold text-muted-foreground">
            {caption}
          </Text>
          <Text
            role="heading"
            aria-level="1"
            numberOfLines={1}
            className="text-section font-bold"
          >
            {title}
          </Text>
        </View>
        <View className="flex-row items-center">
          {anchor !== today ? (
            <Pressable
              onPress={() => onAnchor(today)}
              accessibilityRole="button"
              accessibilityLabel={t('calendar.goToToday')}
              className="h-11 justify-center px-3"
            >
              <Text style={{ color: depth.colors.tint }} className="text-title">
                {t('calendar.today')}
              </Text>
            </Pressable>
          ) : null}
          {([-1, 1] as const).map((dir) => (
            <Pressable
              key={dir}
              onPress={() => onShift(dir)}
              accessibilityRole="button"
              accessibilityLabel={t(
                `calendar.${dir === 1 ? 'next' : 'previous'}.${view}`,
              )}
              className="h-11 w-11 items-center justify-center"
            >
              {dir === -1 ? (
                <ChevronLeft size={22} color={depth.colors.tint} />
              ) : (
                <ChevronRight size={22} color={depth.colors.tint} />
              )}
            </Pressable>
          ))}
        </View>
      </View>

      <Surface
        variant="inset"
        radius={12}
        accessibilityRole="tablist"
        className="mt-3 flex-row p-0.5"
      >
        {VIEWS.map((v) => (
          <Pressable
            key={v}
            onPress={() => onViewChange(v)}
            accessibilityRole="tab"
            accessibilityState={{ selected: view === v }}
            accessibilityLabel={t(`calendar.viewLabel.${v}`)}
            style={view === v ? depth.knob : undefined}
            className={cn(
              'min-h-11 flex-1 items-center justify-center rounded-[10px]',
            )}
          >
            <Text className="text-subtitle font-semibold">
              {t(`calendar.views.${v}`)}
            </Text>
          </Pressable>
        ))}
      </Surface>

      {view === 'day' ? (
        <DayStrip anchor={anchor} today={today} onPick={onAnchor} />
      ) : null}
    </View>
  );
}

function DayStrip({
  anchor,
  today,
  onPick,
}: {
  anchor: ISODate;
  today: ISODate;
  onPick: (date: ISODate) => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  return (
    <View className="mt-2 flex-row justify-between">
      {weekStrip(anchor, today).map((d) => (
        <Pressable
          key={d.date}
          onPress={() => onPick(d.date)}
          accessibilityRole="button"
          accessibilityState={{ selected: d.isSelected }}
          accessibilityLabel={t('calendar.openDay', {
            date: formatDateLong(d.date),
          })}
          className="min-h-11 w-11 items-center justify-center"
        >
          <Text className="text-meta text-muted-foreground">
            {WEEKDAYS[d.weekday].slice(0, 1)}
          </Text>
          <View
            style={
              d.isSelected ? { backgroundColor: depth.colors.tint } : undefined
            }
            className="h-8 w-8 items-center justify-center rounded-full"
          >
            <Text
              style={{
                color: d.isSelected
                  ? '#FFFFFF'
                  : d.isToday
                    ? '#FF3B30'
                    : depth.colors.label,
              }}
              className="text-title font-semibold"
            >
              {d.num}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
