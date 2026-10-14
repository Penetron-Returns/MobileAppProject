import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ground } from '@/components/Ground';
import { Surface } from '@/components/Surface';
import {
  INBOX_DOME_CLEARANCE,
  tabBarClearance,
} from '@/components/tab-bar/layout';
import { Text } from '@/components/ui/text';
import { useAppColorScheme } from '@/hooks/useAppColorScheme';
import { formatMoney } from '@/lib/format';

import { useToday, type TodayView } from '../hooks';
import { LaterToday } from './LaterToday';
import { TodayHeader } from './TodayHeader';
import {
  OfflineBanner,
  TodayAllDone,
  TodayEmpty,
  TodayError,
  TodaySkeleton,
} from './TodayStates';
import { UpNextCard } from './UpNextCard';

/** Today: what is next, what is later, and what the day is worth. */
export function TodayScreen() {
  const view = useToday();
  const { colors } = useAppColorScheme();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = React.useState(false);

  const refresh = view.status === 'ready' ? view.refresh : null;
  const onRefresh = React.useCallback(async () => {
    if (!refresh) return;
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  return (
    <Ground className="flex-1">
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          // Clear the floating tab bar and the Inbox dome above it.
          paddingBottom: tabBarClearance(insets.bottom) + INBOX_DOME_CLEARANCE,
        }}
        refreshControl={
          refresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          ) : undefined
        }
      >
        <View className="w-full max-w-2xl self-center">
          <TodayHeader
            caption={view.status === 'ready' ? view.caption : null}
          />
          <TodayBody view={view} />
        </View>
      </ScrollView>
    </Ground>
  );
}

function TodayBody({ view }: { view: TodayView }) {
  if (view.status === 'loading') return <TodaySkeleton />;
  if (view.status === 'error') {
    return <TodayError error={view.error} onRetry={view.retry} />;
  }
  return (
    <>
      {view.isOffline ? <OfflineBanner lastUpdated={view.lastUpdated} /> : null}
      {view.appointments.length === 0 ? (
        <TodayEmpty />
      ) : view.upNext ? (
        <>
          <UpNextCard
            appointment={view.upNext}
            now={view.now}
            timezone={view.timezone}
          />
          <LaterToday later={view.later} timezone={view.timezone} />
        </>
      ) : (
        <TodayAllDone />
      )}
      {view.appointments.length > 0 ? (
        <TodaySummary
          expectedCents={view.expectedCents}
          currency={view.currency}
        />
      ) : null}
    </>
  );
}

/** One quiet line under the list: what today is expected to bring in. */
function TodaySummary({
  expectedCents,
  currency,
}: {
  expectedCents: number;
  currency: string;
}) {
  const { t } = useTranslation();
  return (
    <View className="mx-5 mt-5">
      <Surface variant="engrave" className="h-0.5" />
      <Text className="pt-3.5 text-subtitle text-muted-foreground">
        {t('today.expected', {
          amount: formatMoney(expectedCents, currency, { decimals: false }),
        })}
      </Text>
    </View>
  );
}
