import { useUser } from '@clerk/expo';
import {
  Ground,
  KEYBOARD_AVOIDING_BEHAVIOR,
  tabBarClearance,
} from '@booking/ui';
import {
  CompanionMoment,
  type MomentAvatarProperties,
} from '@nerova/react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAttendance } from '@/features/attendance/hooks';
import { useBusiness } from '@/features/business/hooks';
import { useCompanionSheet } from '@/features/companion/sdk/companionSheetControl';
import { formatDayCaption } from '@/features/today/logic';
import { useIsKeyboardVisible } from '@/hooks/useIsKeyboardVisible';
import { useNow } from '@/hooks/useNow';
import { toast } from '@/lib/toast';
import { todayISO } from '@/lib/time';

import { greetingText } from '../greeting';
import { attendanceQueue, outcomeForAction } from '../queue';
import { storyActionOutcome } from '../storyActions';
import { useStartVoice } from '../useStartVoice';
import { useStories } from '../useStories';
import { useStoryEvents } from '../useStoryEvents';
import { ClovieHeader } from './ClovieHeader';
import { MomentClovie } from './MomentClovie';
import { StoriesRow } from './StoriesRow';

/** The greeting only changes on the hour, so a slow clock is plenty. */
const CLOCK_MS = 5 * 60_000;
const FALLBACK_TIMEZONE = 'UTC';

/**
 * The Clovie tab (first tab): our shell, the greeting and the stories row,
 * around Nerova's `<CompanionMoment>` (the chat UI is theirs; we host it). It
 * shares the app-wide SDK session from `CompanionSdkHost`, so with no companion
 * on the plan (or the flag off) there is no chat area. The attendance questions
 * are its `queueItems`. The screen rides the keyboard and, while it is up, drops
 * the header and stories so the composer and the answer keep the room.
 */
/** Stable: the SDK would otherwise redraw the avatar on every render. */
const renderAvatar = (props: MomentAvatarProperties) => (
  <MomentClovie {...props} />
);

export function ClovieTabScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const business = useBusiness();
  const now = useNow(CLOCK_MS);
  const timezone = business.data?.timezone ?? FALLBACK_TIMEZONE;
  const { isAvailable, hasFailed } = useCompanionSheet();
  const startVoice = useStartVoice();
  const attendance = useAttendance();
  const isKeyboardUp = useIsKeyboardVisible();
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
      {/* In `padding` mode the view overwrites its own paddingBottom with the
          keyboard height, so the tab-bar clearance lives on the inner View. */}
      <KeyboardAvoidingView
        behavior={KEYBOARD_AVOIDING_BEHAVIOR}
        style={{ flex: 1, paddingTop: insets.top + 8 }}
      >
        <View
          className="w-full max-w-2xl flex-1 self-center"
          style={{
            minHeight: 0,
            // The floating bar sits under the keyboard, so only clear it when
            // the keyboard is down; the composer then rests right on the keys.
            paddingBottom: isKeyboardUp
              ? 8
              : tabBarClearance(insets.bottom) + 8,
          }}
        >
          {isKeyboardUp ? null : (
            <>
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
            </>
          )}
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
        </View>
      </KeyboardAvoidingView>
    </Ground>
  );
}
