import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { ErrorState, LoadingCard } from '@/components/States';
import { TabHeader } from '@/components/TabHeader';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAppointmentsBetween } from '@/features/appointments/hooks';
import { BusinessGate } from '@/features/business/components/BusinessGate';
import {
  useBusinessHours,
  type BusinessSummary,
} from '@/features/business/hooks';
import {
  formatDateLong,
  formatMonthYear,
  formatWeekRange,
  startOfWeek,
  todayISO,
  weekdayOf,
  WEEKDAYS,
  zonedTimeToUtc,
  type ISODate,
} from '@/lib/time';
import { cn } from '@/lib/utils';

import { periodRange, shiftAnchor } from '../logic';
import {
  subscribeCalendarViewMode,
  type CalendarViewMode,
} from '../navigation';
import { DayView, MonthView, WeekView } from './CalendarViews';

const VIEWS: CalendarViewMode[] = ['day', 'week', 'month'];
const VIEW_COMPONENTS = { day: DayView, week: WeekView, month: MonthView };

export function CalendarScreen() {
  const queryClient = useQueryClient();
  return (
    <Screen
      header={<TabHeader />}
      onRefresh={() => queryClient.refetchQueries({ type: 'active' })}
    >
      <BusinessGate>
        {(business) => <CalendarContent business={business} />}
      </BusinessGate>
    </Screen>
  );
}

function isView(value: unknown): value is CalendarViewMode {
  return typeof value === 'string' && (VIEWS as string[]).includes(value);
}

function CalendarContent({ business }: { business: BusinessSummary }) {
  const tz = business.timezone;
  const params = useLocalSearchParams<{ view?: string; t?: string }>();
  const today = todayISO(tz);
  const [view, setView] = React.useState<CalendarViewMode>('day');
  const [anchor, setAnchor] = React.useState<ISODate>(today);

  React.useEffect(
    () =>
      subscribeCalendarViewMode((mode) => {
        setView(mode);
        if (mode === 'day') setAnchor(todayISO(tz));
      }),
    [tz],
  );

  React.useEffect(() => {
    if (!isView(params.view)) return;
    setView(params.view);
    if (params.view === 'day') setAnchor(todayISO(tz));
  }, [params.view, params.t, tz]);

  const range = periodRange(view, anchor);
  const appointments = useAppointmentsBetween(
    zonedTimeToUtc(range.from, '00:00', tz).toISOString(),
    zonedTimeToUtc(range.to, '00:00', tz).toISOString(),
  );
  const hours = useBusinessHours();
  const openDay = (date: ISODate) => {
    setAnchor(date);
    setView('day');
  };

  const failed = appointments.isError
    ? appointments
    : hours.isError
      ? hours
      : null;
  const ViewComponent = VIEW_COMPONENTS[view];
  return (
    <View className="gap-3">
      <CalendarToolbar
        view={view}
        anchor={anchor}
        onViewChange={setView}
        onShift={(dir) => setAnchor((a) => shiftAnchor(view, a, dir))}
        onToday={() => setAnchor(todayISO(tz))}
      />
      {failed ? (
        <ErrorState
          error={failed.error}
          onRetry={() => void failed.refetch()}
        />
      ) : !appointments.data || !hours.data ? (
        <LoadingCard />
      ) : (
        <ViewComponent
          anchor={anchor}
          today={today}
          appointments={appointments.data}
          hours={hours.data}
          timezone={tz}
          onOpenDay={openDay}
        />
      )}
    </View>
  );
}

function periodTitle(
  view: CalendarViewMode,
  anchor: ISODate,
  t: (k: string) => string,
) {
  if (view === 'month')
    return {
      title: formatMonthYear(anchor),
      subtitle: t('calendar.monthView'),
    };
  if (view === 'week')
    return {
      title: formatWeekRange(startOfWeek(anchor)),
      subtitle: t('calendar.weekView'),
    };
  return {
    title: formatDateLong(anchor),
    subtitle: WEEKDAYS[weekdayOf(anchor)],
  };
}

function CalendarToolbar({
  view,
  anchor,
  onViewChange,
  onShift,
  onToday,
}: {
  view: CalendarViewMode;
  anchor: ISODate;
  onViewChange: (view: CalendarViewMode) => void;
  onShift: (direction: 1 | -1) => void;
  onToday: () => void;
}) {
  const { t } = useTranslation();
  const { title, subtitle } = periodTitle(view, anchor, t);
  return (
    <View className="gap-3 sm:flex-row sm:items-center sm:justify-between">
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={() => onShift(-1)}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-accent"
          accessibilityRole="button"
          accessibilityLabel={t(`calendar.previous.${view}`)}
        >
          <Icon as={ChevronLeft} size={20} className="text-foreground" />
        </Pressable>
        <View className="flex-1 items-center px-1">
          <Text className="text-foreground text-xl font-bold">{title}</Text>
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-widest">
            {subtitle}
          </Text>
        </View>
        <Pressable
          onPress={() => onShift(1)}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-accent"
          accessibilityRole="button"
          accessibilityLabel={t(`calendar.next.${view}`)}
        >
          <Icon as={ChevronRight} size={20} className="text-foreground" />
        </Pressable>
        <Pressable
          onPress={onToday}
          className="border-border min-h-[36px] justify-center rounded-full border px-3.5 py-1.5 active:bg-accent"
          accessibilityRole="button"
        >
          <Text className="text-primary text-xs font-semibold">
            {t('calendar.today')}
          </Text>
        </Pressable>
      </View>
      <View className="bg-muted flex-row self-center rounded-full p-1">
        {VIEWS.map((v) => (
          <Pressable
            key={v}
            onPress={() => onViewChange(v)}
            className={cn(
              'min-h-[36px] justify-center rounded-full px-5 py-1.5',
              view === v ? 'bg-primary shadow-sm' : 'active:bg-accent/50',
            )}
            accessibilityRole="button"
            accessibilityState={{ selected: view === v }}
            accessibilityLabel={t(`calendar.viewLabel.${v}`)}
          >
            <Text
              className={cn(
                'text-xs font-semibold',
                view === v
                  ? 'text-primary-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {t(`calendar.views.${v}`)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
