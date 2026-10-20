import type { AttendanceOutcome } from '@booking/types';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { useAnswerAttendance } from './hooks';
import { parseAttendancePush } from './logic';

/** Matches `categoryId` in the backend's attendance push. */
export const ATTENDANCE_CATEGORY = 'attendance_check';

/** Action identifiers double as the API outcome. */
const OUTCOME_ACTIONS: readonly AttendanceOutcome[] = ['came', 'no_show'];

export type AttendanceResponseRoute =
  | { kind: 'answer'; checkId: string; outcome: AttendanceOutcome }
  | { kind: 'open-home' }
  | { kind: 'open-list' }
  | { kind: 'ignore' };

/** Decides what a tap on an attendance notification (or one of its actions) means. */
export function routeAttendanceResponse(
  actionIdentifier: string,
  data: unknown,
): AttendanceResponseRoute {
  const push = parseAttendancePush(data);
  if (!push) return { kind: 'ignore' };
  if (push.type !== 'attendance_check') return { kind: 'open-list' };
  const outcome = OUTCOME_ACTIONS.find((o) => o === actionIdentifier);
  if (outcome) return { kind: 'answer', checkId: push.checkId, outcome };
  return { kind: 'open-home' };
}

/** "Came" / "No-show" buttons on the question; neither opens the app where the platform allows. */
export function registerAttendanceCategory(labels: {
  came: string;
  noShow: string;
}) {
  return Notifications.setNotificationCategoryAsync(ATTENDANCE_CATEGORY, [
    {
      identifier: 'came',
      buttonTitle: labels.came,
      options: { opensAppToForeground: false },
    },
    {
      identifier: 'no_show',
      buttonTitle: labels.noShow,
      options: { opensAppToForeground: false, isDestructive: true },
    },
  ]);
}

export interface ResponseHandlers {
  answer: (checkId: string, outcome: AttendanceOutcome) => Promise<unknown>;
  openHome: () => void;
  openList: () => void;
}

/** Acts on one notification response. Never throws: a failed answer already toasts. */
export async function handleAttendanceResponse(
  response: Pick<
    Notifications.NotificationResponse,
    'actionIdentifier' | 'notification'
  >,
  handlers: ResponseHandlers,
): Promise<void> {
  const route = routeAttendanceResponse(
    response.actionIdentifier,
    response.notification.request.content.data,
  );
  switch (route.kind) {
    case 'answer':
      await handlers
        .answer(route.checkId, route.outcome)
        .catch(() => undefined);
      return;
    case 'open-home':
      handlers.openHome();
      return;
    case 'open-list':
      handlers.openList();
      return;
    case 'ignore':
      return;
  }
}

function responseKey(response: Notifications.NotificationResponse): string {
  return `${response.notification.request.identifier}:${response.actionIdentifier}`;
}

/**
 * Sets up the attendance notification: the action category, taps while the app
 * runs or sits in the background, and the tap that launched it from killed.
 * An action that does not open the app is lost when the app is killed (the
 * platform never starts our JS); the question then simply stays on Home.
 */
export function useAttendanceNotifications(enabled: boolean) {
  const { t } = useTranslation();
  const { mutateAsync } = useAnswerAttendance();
  const answerRef = React.useRef(mutateAsync);
  answerRef.current = mutateAsync;
  const labels = {
    came: t('attendance.notification.came'),
    noShow: t('attendance.notification.noShow'),
  };

  React.useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    registerAttendanceCategory(labels).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- labels only change with the language
  }, [enabled, labels.came, labels.noShow]);

  React.useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    const handled = new Set<string>();
    const handlers: ResponseHandlers = {
      answer: (checkId, outcome) => answerRef.current({ checkId, outcome }),
      openHome: () => router.navigate('/' as never),
      openList: () => router.push('/attendance' as never),
    };
    const handle = (response: Notifications.NotificationResponse) => {
      const key = responseKey(response);
      if (handled.has(key)) return;
      handled.add(key);
      void handleAttendanceResponse(response, handlers);
    };
    const subscription =
      Notifications.addNotificationResponseReceivedListener(handle);
    void Notifications.getLastNotificationResponseAsync()
      .then((last) => {
        if (!last) return;
        handle(last);
        return Notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => undefined);
    return () => subscription.remove();
  }, [enabled]);
}
