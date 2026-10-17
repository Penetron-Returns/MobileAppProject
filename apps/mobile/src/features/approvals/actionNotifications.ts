import * as Notifications from 'expo-notifications';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

import { useOpenCompanion } from '../companion/sdk/useOpenCompanion';

/** Matches `ACTION_CATEGORY` in the backend's act-then-undo push (packages/companion/approvals/actionPush.ts). */
export const ACTION_CATEGORY = 'clovie_action';

/** The notification button's identifier. */
const UNDO_ACTION = 'undo';

export type ActionResponseRoute =
  | { kind: 'undo'; actionId: string }
  | { kind: 'open-companion' }
  | { kind: 'ignore' };

/** The action id of an act-then-undo push, or null for any other notification. */
export function parseActionPush(data: unknown): { actionId: string } | null {
  if (typeof data !== 'object' || data === null) return null;
  const { type, actionId } = data as Record<string, unknown>;
  return type === 'action' && typeof actionId === 'string' && actionId
    ? { actionId }
    : null;
}

/** Decides what a tap on the "Clovie booked it" notification (or its Undo button) means. */
export function routeActionResponse(
  actionIdentifier: string,
  data: unknown,
): ActionResponseRoute {
  const push = parseActionPush(data);
  if (!push) return { kind: 'ignore' };
  if (actionIdentifier === UNDO_ACTION) {
    return { kind: 'undo', actionId: push.actionId };
  }
  return { kind: 'open-companion' };
}

/** Deterministic, so a replayed tap never undoes twice. */
export const actionUndoIdempotencyKey = (actionId: string) =>
  `action:${actionId}:undo`;

/** The "Undo" button; it does not open the app where the platform allows. */
export function registerActionCategory(labels: { undo: string }) {
  return Notifications.setNotificationCategoryAsync(ACTION_CATEGORY, [
    {
      identifier: UNDO_ACTION,
      buttonTitle: labels.undo,
      options: { opensAppToForeground: false },
    },
  ]);
}

export interface ActionResponseHandlers {
  undo: (actionId: string) => Promise<unknown>;
  openCompanion: () => void;
}

/** Acts on one notification response. Never throws: a failed undo is reported by the handler. */
export async function handleActionResponse(
  response: Pick<
    Notifications.NotificationResponse,
    'actionIdentifier' | 'notification'
  >,
  handlers: ActionResponseHandlers,
): Promise<void> {
  const route = routeActionResponse(
    response.actionIdentifier,
    response.notification.request.content.data,
  );
  switch (route.kind) {
    case 'undo':
      await handlers.undo(route.actionId).catch(() => undefined);
      return;
    case 'open-companion':
      handlers.openCompanion();
      return;
    case 'ignore':
      return;
  }
}

/** Whether an undo failed because the window closed or the booking can no longer be undone. */
export function isTooLateToUndo(error: unknown): boolean {
  const { code, details } = (error ?? {}) as {
    code?: unknown;
    details?: { reason?: unknown };
  };
  return (
    code === 'RULE_VIOLATION' &&
    (details?.reason === 'action.undo_window_closed' ||
      details?.reason === 'action.not_undoable')
  );
}

const responseKey = (response: Notifications.NotificationResponse) =>
  `${response.notification.request.identifier}:${response.actionIdentifier}`;

const isActionResponse = (response: Notifications.NotificationResponse) =>
  parseActionPush(response.notification.request.content.data) !== null;

/**
 * Sets up the "Clovie booked it" notification: the Undo category, taps while the app runs or sits in the background,
 * and the tap that launched it from killed. Must render inside the companion host (the body opens the sheet). An Undo
 * that does not open the app is lost when the app is killed (the platform never starts our JS): the owner can still
 * undo in the companion within the window.
 */
export function useActionNotifications(enabled: boolean) {
  const { t } = useTranslation();
  const openCompanion = useOpenCompanion();
  const openRef = React.useRef(openCompanion);
  openRef.current = openCompanion;
  const undoLabel = t('actions.notification.undo');

  React.useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    registerActionCategory({ undo: undoLabel }).catch(() => undefined);
  }, [enabled, undoLabel]);

  React.useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    const handled = new Set<string>();
    const handlers: ActionResponseHandlers = {
      undo: async (actionId) => {
        try {
          const result = await api.voiceUndoAction(
            actionId,
            actionUndoIdempotencyKey(actionId),
          );
          toast.success(t('actions.notification.undone'));
          return result;
        } catch (error) {
          toast.failed(
            t(
              isTooLateToUndo(error)
                ? 'actions.notification.tooLate'
                : 'actions.notification.failed',
            ),
            error,
          );
          throw error;
        }
      },
      openCompanion: () => openRef.current(),
    };
    const handle = (response: Notifications.NotificationResponse) => {
      if (!isActionResponse(response)) return;
      const key = responseKey(response);
      if (handled.has(key)) return;
      handled.add(key);
      void handleActionResponse(response, handlers);
    };
    const subscription =
      Notifications.addNotificationResponseReceivedListener(handle);
    void Notifications.getLastNotificationResponseAsync()
      .then((last) => {
        if (!last || !isActionResponse(last)) return;
        handle(last);
        return Notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => undefined);
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is stable per language; handlers read refs
  }, [enabled]);
}
