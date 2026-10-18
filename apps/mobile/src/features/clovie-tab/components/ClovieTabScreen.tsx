import { Ground, haptics, tabBarClearance } from '@booking/ui';
import {
  CompanionMoment,
  CompanionSetupCard,
  type MomentAvatarProperties,
} from '@nerova/react-native';
import * as React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAttendance } from '@/features/attendance/hooks';
import { useBusiness } from '@/features/business/hooks';
import { useMe } from '@/features/business/me';
import { useOpenSetupOnce } from '@/features/companion/useOpenSetupOnce';
import { useCompanionSheet } from '@/features/companion/sdk/companionSheetControl';
import { useKeyboardHeight } from '@/features/onboarding/useKeyboardHeight';
import { toast } from '@/lib/toast';

import { attendanceQueue, outcomeForAction } from '../queue';
import { storyActionOutcome } from '../storyActions';
import { useStartVoice } from '../useStartVoice';
import { useStories } from '../useStories';
import { useStoryEvents } from '../useStoryEvents';
import { ClovieHeader } from './ClovieHeader';
import { MomentClovie } from './MomentClovie';
import { StoriesRow } from './StoriesRow';

const FALLBACK_TIMEZONE = 'UTC';

/**
 * The Clovie tab (first tab): our shell, the greeting and the stories row,
 * around Nerova's `<CompanionMoment>` (the chat UI is theirs; we host it). It
 * shares the app-wide SDK session from `CompanionSdkHost`, so with no companion
 * on the plan (or the flag off) there is no chat area. The attendance questions
 * are its `queueItems`. The screen rides the keyboard: the page stays as it is and
 * only the composer lifts above the keys (the answer area shrinks or scrolls).
 */
/** Stable: the SDK would otherwise redraw the avatar on every render. */
const renderAvatar = (props: MomentAvatarProperties) => (
  <MomentClovie {...props} />
);

export function ClovieTabScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const business = useBusiness();
  const isOwner = useMe().data?.role === 'owner';
  const timezone = business.data?.timezone ?? FALLBACK_TIMEZONE;
  const { isAvailable, hasFailed } = useCompanionSheet();
  useOpenSetupOnce();
  const startVoice = useStartVoice();
  const attendance = useAttendance();
  const keyboardHeight = useKeyboardHeight();
  const clearance = tabBarClearance(insets.bottom);
  // Rides the keyboard on the UI thread, frame by frame (no state flip, no jump):
  // the composer rests above the floating bar, or right on the keys when they are up.
  const pageStyle = useAnimatedStyle(() => ({
    paddingBottom: Math.max(keyboardHeight.value, clearance) + 8,
  }));
  const { stories, isLoading, isError, refetch, markViewed } = useStories();
  const refetchStories = React.useCallback(() => void refetch(), [refetch]);
  const events = useStoryEvents(stories);

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
      if (check && outcome) {
        haptics.light();
        void answer(check, outcome);
      }
    },
    [attendance.checks, answer],
  );

  const onMicPress = React.useCallback(() => void startVoice(), [startVoice]);

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
      <Animated.View
        className="w-full max-w-2xl flex-1 self-center"
        style={[{ minHeight: 0, paddingTop: insets.top + 8 }, pageStyle]}
      >
        <ClovieHeader />
        <StoriesRow
          stories={stories}
          isLoading={isLoading}
          isError={isError}
          onRetry={refetchStories}
          onViewed={markViewed}
          onEvent={events.record}
          onAction={onStoryAction}
          onClose={events.flush}
        />
        {isOwner && isAvailable ? (
          // One row; renders nothing unless setup is needed. It appears once
          // the SDK has loaded setup state (a one-time shift, not animated).
          <View className="px-4 pt-2">
            <CompanionSetupCard testID="clovie-setup-card" />
          </View>
        ) : null}
        {isAvailable || hasFailed ? (
          <CompanionMoment
            testID="clovie-moment"
            idleLine={t('clovieTab.idleLine')}
            queueItems={queue}
            onQueueAction={onQueueAction}
            onMicPress={onMicPress}
            enableUndo={false}
            renderAvatar={renderAvatar}
          />
        ) : null}
      </Animated.View>
    </Ground>
  );
}
