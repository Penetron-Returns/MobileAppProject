import {
  ErrorState,
  Ground,
  INBOX_DOME_CLEARANCE,
  OfflineBanner,
  Skeleton,
  Surface,
  tabBarClearance,
  Text,
  useAppColorScheme,
} from '@booking/ui';
import { useLocalSearchParams } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusiness } from '@/features/business/hooks';
import { isFailed, loadError } from '@/lib/offline';
import { describeError } from '@/lib/toast';
import { todayISO, type ISODate } from '@/lib/time';
import { useCalendarDay, useCalendarWeek } from '../hooks';
import { shiftAnchor } from '../logic';
import {
  subscribeCalendarViewMode,
  type CalendarViewMode,
} from '../navigation';
import { DayView } from './DayView';
import { WeekView } from './WeekView';
import { CalendarHeader, VIEWS } from './CalendarHeader';

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
        ) : isFailed(business) ? (
          <ErrorState
            variant="banner"
            title={t('calendar.error.title')}
            description={t('calendar.error.description')}
            {...describeError(loadError(business))}
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
      <ErrorState
        variant="banner"
        title={t('calendar.error.title')}
        description={t('calendar.error.description')}
        {...describeError(view.error)}
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
          <ErrorState
            variant="banner"
            title={t('calendar.error.title')}
            description={t('calendar.error.description')}
            {...describeError(view.error)}
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
