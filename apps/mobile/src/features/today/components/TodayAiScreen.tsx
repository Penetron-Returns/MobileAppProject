import {
  Ground,
  IconButton,
  OfflineBanner,
  Text,
  tabBarClearance,
} from '@booking/ui';
import { Bell } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCompanionLive } from '@/features/companion/sdk/companionLive';
import { useOpenCompanion } from '@/features/companion/sdk/useOpenCompanion';
import { savedCopyLabel } from '@/lib/offline';
import { toast } from '@/lib/toast';

import { useTodayAi } from '../aiHooks';
import { hasAfternoonStarted } from '../aiLogic';
import { formatDayCaption } from '../logic';
import { NeedsYou } from './ai/NeedsYou';
import { NowRow } from './ai/NowRow';
import { TodayNumbers } from './ai/ProgressRing';
import { TodaySoFar } from './ai/TodaySoFar';
import { TodayError, TodaySkeleton } from './TodayStates';

/** Date line and the notification bell. The big title is left out: the tab already says Today. */
function Header({ caption }: { caption: string }) {
  const { t } = useTranslation();
  return (
    <View className="h-11 flex-row items-center justify-between pl-5 pr-4">
      <Text
        role="heading"
        aria-level="1"
        className="text-title font-semibold text-muted-foreground"
      >
        {caption}
      </Text>
      <IconButton
        icon={Bell}
        label={t('today.notifications')}
        size="sm"
        tone="label"
        onPress={() => toast.info(t('today.noNotifications'))}
      />
    </View>
  );
}

/** How long the companion's follow-up line stays before the home returns to normal. */
const CONFIRMATION_MS = 3000;

/**
 *Today for the plans with the companion: Clovie and what she is doing, the
 * day's numbers, anything that needs the owner, and what changed so far.
 * Announcements are left out until there is a source for them.
 */
export function TodayAiScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const view = useTodayAi();
  const live = useCompanionLive();
  const openClovie = useOpenCompanion();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState<string | null>(null);

  // The companion's follow-up replaces the card briefly, then the usual state returns.
  React.useEffect(() => {
    if (!confirmation) return;
    const timer = setTimeout(() => setConfirmation(null), CONFIRMATION_MS);
    return () => clearTimeout(timer);
  }, [confirmation]);

  const approve = React.useCallback(
    async (id: string) => {
      if (!live) return;
      setBusyId(id);
      try {
        const approved = await live.approve(id);
        setConfirmation(approved?.followUp?.text.trim() || null);
      } catch (error) {
        toast.failed(t('today.ai.needs.approveFailed'), error);
      } finally {
        setBusyId(null);
      }
    },
    [live, t],
  );

  const refresh = view.status === 'ready' ? view.refresh : undefined;
  const onRefresh = React.useCallback(async () => {
    if (!refresh) return;
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const caption = view.status === 'ready' ? formatDayCaption(view.date) : ' ';
  const isBusy = live?.activity === 'busy';
  return (
    <Ground className="flex-1">
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: tabBarClearance(insets.bottom) + 16,
        }}
        refreshControl={
          refresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
            />
          ) : undefined
        }
      >
        <View className="w-full max-w-2xl self-center">
          <Header caption={caption} />
          {view.status === 'loading' ? <TodaySkeleton /> : null}
          {view.status === 'error' ? (
            <TodayError error={view.error} onRetry={view.retry} />
          ) : null}
          {view.status === 'ready' ? (
            <>
              {view.isOffline ? (
                <OfflineBanner label={savedCopyLabel(t, view.lastUpdated)} />
              ) : null}
              <NowRow
                row={view.nowRow(isBusy)}
                isBusy={isBusy}
                isPaused={live?.isSheetOpen ?? false}
                onOpenClovie={openClovie}
              />
              <TodayNumbers
                percent={view.percent}
                revenueCents={view.revenueCents}
                currency={view.currency}
                clovieBooked={view.clovieBooked}
              />
              <NeedsYou
                pending={live?.pending ?? []}
                busyId={busyId}
                confirmation={confirmation}
                onApprove={(id) => void approve(id)}
                onOpenClovie={openClovie}
              />
              <TodaySoFar
                morning={view.digest.morning}
                afternoon={view.digest.afternoon}
                hasAfternoonStarted={hasAfternoonStarted(
                  view.now,
                  view.timezone,
                )}
              />
            </>
          ) : null}
        </View>
      </ScrollView>
    </Ground>
  );
}
