import { useUser } from '@clerk/expo';
import { Ground, tabBarClearance } from '@booking/ui';
import { router } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAttendance } from '@/features/attendance/hooks';
import { useBusiness } from '@/features/business/hooks';
import { useOpenCompanion } from '@/features/companion/sdk/useOpenCompanion';
import { formatDayCaption } from '@/features/today/logic';
import { useNow } from '@/hooks/useNow';
import { toast } from '@/lib/toast';
import { todayISO } from '@/lib/time';

import { greetingText } from '../greeting';
import { attendanceQueue, outcomeForAction } from '../queue';
import { storyActionOutcome } from '../storyActions';
import { useStartVoice } from '../useStartVoice';
import { useStories } from '../useStories';
import { useStoryEvents } from '../useStoryEvents';
import { AttendanceQueue } from './AttendanceQueue';
import { ChatPlaceholder } from './ChatPlaceholder';
import { ClovieHeader } from './ClovieHeader';
import { StoriesRow } from './StoriesRow';

/** The greeting only changes on the hour, so a slow clock is plenty. */
const CLOCK_MS = 5 * 60_000;
const FALLBACK_TIMEZONE = 'UTC';

/**
 * The Clovie tab (first tab): our shell, the greeting and the stories row,
 * around Nerova's chat area. The chat area is a placeholder until
 * `<CompanionMoment>` ships; the attendance queue sits above it and becomes
 * its `queueItems`. Nothing here animates at rest.
 */
export function ClovieTabScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const business = useBusiness();
  const now = useNow(CLOCK_MS);
  const timezone = business.data?.timezone ?? FALLBACK_TIMEZONE;
  const openChat = useOpenCompanion();
  const startVoice = useStartVoice();
  const attendance = useAttendance();
  const { stories, isLoading, markViewed } = useStories();
  const events = useStoryEvents(stories);

  const greeting = greetingText(now, timezone, user?.firstName);
  const caption = formatDayCaption(todayISO(timezone, now));

  const queue = React.useMemo(
    () =>
      attendanceQueue(attendance.checks, timezone, {
        question: (values) => t('attendance.question', values),
        came: t('attendance.came'),
        noShow: t('attendance.noShow'),
        cameFor: (name) => t('attendance.cameLabel', { name }),
        noShowFor: (name) => t('attendance.noShowLabel', { name }),
      }),
    [attendance.checks, timezone, t],
  );

  const { answer } = attendance;
  const onQueueAction = React.useCallback(
    (itemId: string, actionId: string) => {
      const check = attendance.checks.find((c) => c.id === itemId);
      const outcome = outcomeForAction(actionId);
      if (check && outcome) void answer(check, outcome);
    },
    [attendance.checks, answer],
  );

  const onStoryAction = React.useCallback(
    (card: Parameters<typeof storyActionOutcome>[0]) => {
      const outcome = storyActionOutcome(card);
      if (outcome === 'voice') void startVoice();
      else if (outcome === 'coming-soon') toast.info(t('clovieTab.comingSoon'));
    },
    [startVoice, t],
  );

  return (
    <Ground className="flex-1">
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 8,
          paddingBottom: tabBarClearance(insets.bottom) + 16,
        }}
      >
        <View className="w-full max-w-2xl flex-1 self-center">
          <ClovieHeader
            caption={caption}
            greeting={t(greeting.key, greeting.values)}
          />
          <StoriesRow
            stories={stories}
            isLoading={isLoading}
            onViewed={markViewed}
            onEvent={events.record}
            onAction={onStoryAction}
            onClose={events.flush}
          />
          <AttendanceQueue
            items={queue}
            confirmation={attendance.confirmation}
            onAction={onQueueAction}
            onOpenAll={() => router.push('/attendance' as never)}
          />
          <ChatPlaceholder onOpenChat={openChat} onStartVoice={startVoice} />
        </View>
      </ScrollView>
    </Ground>
  );
}
