import * as Notifications from 'expo-notifications';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

import { useOpenCompanion } from '../companion/sdk/useOpenCompanion';

/** Matches `categoryId` in the backend's approval push (packages/companion/approvals/approvalPush.ts). */
export const APPROVAL_CATEGORY = 'clovie_approval';

export type ApprovalDecision = 'approve' | 'decline';

/** Action identifiers double as the API decision. */
const DECISION_ACTIONS: readonly ApprovalDecision[] = ['approve', 'decline'];

export type ApprovalResponseRoute =
  | { kind: 'decide'; approvalId: string; decision: ApprovalDecision }
  | { kind: 'open-companion' }
  | { kind: 'ignore' };

/** The approval id of an approval push, or null for any other notification. */
export function parseApprovalPush(
  data: unknown,
): { approvalId: string } | null {
  if (typeof data !== 'object' || data === null) return null;
  const { type, approvalId } = data as Record<string, unknown>;
  return type === 'approval' && typeof approvalId === 'string' && approvalId
    ? { approvalId }
    : null;
}

/** Decides what a tap on an approval notification (or one of its buttons) means. */
export function routeApprovalResponse(
  actionIdentifier: string,
  data: unknown,
): ApprovalResponseRoute {
  const push = parseApprovalPush(data);
  if (!push) return { kind: 'ignore' };
  const decision = DECISION_ACTIONS.find((d) => d === actionIdentifier);
  if (decision)
    return { kind: 'decide', approvalId: push.approvalId, decision };
  return { kind: 'open-companion' };
}

/** Deterministic, so a replayed action never decides twice. */
export const approvalIdempotencyKey = (
  approvalId: string,
  decision: ApprovalDecision,
) => `approval:${approvalId}:${decision}`;

/** "Approve" / "Decline" buttons; neither opens the app where the platform allows. */
export function registerApprovalCategory(labels: {
  approve: string;
  decline: string;
}) {
  return Notifications.setNotificationCategoryAsync(APPROVAL_CATEGORY, [
    {
      identifier: 'approve',
      buttonTitle: labels.approve,
      options: { opensAppToForeground: false },
    },
    {
      identifier: 'decline',
      buttonTitle: labels.decline,
      options: { opensAppToForeground: false, isDestructive: true },
    },
  ]);
}

export interface ApprovalResponseHandlers {
  decide: (approvalId: string, decision: ApprovalDecision) => Promise<unknown>;
  openCompanion: () => void;
}

/** Acts on one notification response. Never throws: a failed decision is reported by the handler. */
export async function handleApprovalResponse(
  response: Pick<
    Notifications.NotificationResponse,
    'actionIdentifier' | 'notification'
  >,
  handlers: ApprovalResponseHandlers,
): Promise<void> {
  const route = routeApprovalResponse(
    response.actionIdentifier,
    response.notification.request.content.data,
  );
  switch (route.kind) {
    case 'decide':
      await handlers
        .decide(route.approvalId, route.decision)
        .catch(() => undefined);
      return;
    case 'open-companion':
      handlers.openCompanion();
      return;
    case 'ignore':
      return;
  }
}

const responseKey = (response: Notifications.NotificationResponse) =>
  `${response.notification.request.identifier}:${response.actionIdentifier}`;

const isApprovalResponse = (response: Notifications.NotificationResponse) =>
  parseApprovalPush(response.notification.request.content.data) !== null;

/**
 * Sets up the approval notification: the Approve/Decline category, taps while the app runs or sits in the
 * background, and the tap that launched it from killed. Must render inside the companion host (it opens the
 * sheet). An action that does not open the app is lost when the app is killed (the platform never starts our
 * JS); the approval then simply waits in the companion.
 */
export function useApprovalNotifications(enabled: boolean) {
  const { t } = useTranslation();
  const openCompanion = useOpenCompanion();
  const openRef = React.useRef(openCompanion);
  openRef.current = openCompanion;
  const labels = {
    approve: t('approvals.notification.approve'),
    decline: t('approvals.notification.decline'),
  };

  React.useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    registerApprovalCategory(labels).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- labels only change with the language
  }, [enabled, labels.approve, labels.decline]);

  React.useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    const handled = new Set<string>();
    const handlers: ApprovalResponseHandlers = {
      decide: async (approvalId, decision) => {
        try {
          await api.voiceDecideApproval(
            approvalId,
            decision,
            approvalIdempotencyKey(approvalId, decision),
          );
        } catch (error) {
          toast.failed(t('approvals.notification.failed'), error);
          throw error;
        }
      },
      openCompanion: () => openRef.current(),
    };
    const handle = (response: Notifications.NotificationResponse) => {
      if (!isApprovalResponse(response)) return;
      const key = responseKey(response);
      if (handled.has(key)) return;
      handled.add(key);
      void handleApprovalResponse(response, handlers);
    };
    const subscription =
      Notifications.addNotificationResponseReceivedListener(handle);
    void Notifications.getLastNotificationResponseAsync()
      .then((last) => {
        if (!last || !isApprovalResponse(last)) return;
        handle(last);
        return Notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => undefined);
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is stable per language; handlers read refs
  }, [enabled]);
}
