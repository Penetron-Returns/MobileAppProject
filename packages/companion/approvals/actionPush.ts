/**
 * Turns a Nerova `action.executed` delivery (act-then-undo) into an Expo push to the business owners: "Clovie booked
 * it" with the action title and an Undo button. The webhook is thin (ids and times only), so the title comes from
 * Nerova's action read; if that read is unavailable the push still goes out with a generic body, because the undo
 * window is short. No push once `undoUntil` has passed. Owners only. Never a client name or phone number.
 */
import type { Logger } from '@booking/features/lib/logger.ts';
import type { AttendancePush, AttendanceRepository } from '@booking/features/attendance/ports.ts';
import type { NerovaActionsClient } from '../nerova/actions.ts';

/** Notification category registered by the app (Undo button). */
export const ACTION_CATEGORY = 'clovie_action';
export const ACTION_PUSH_TITLE = 'Clovie booked it';
const ACTION_FALLBACK_BODY = 'Open Clovie to review, or undo it';

export interface ActionExecutedObject {
  accountId: string;
  actionId: string;
  kind: string;
  executedAt: string | null;
  undoUntil: string | null;
  /** Our business id (the Nerova external reference); null when Nerova has none */
  externalReference: string | null;
}

export type ActionPushOutcome = 'sent' | 'no_business' | 'window_closed' | 'no_devices';

export interface ActionPushDeps {
  /** Null when NEROVA_API_KEY is unset */
  actions: NerovaActionsClient | null;
  repo: Pick<AttendanceRepository, 'getBusinessContext'>;
  push: AttendancePush;
  logger: Logger;
  clock: () => Date;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function notifyActionExecuted(deps: ActionPushDeps, event: ActionExecutedObject): Promise<ActionPushOutcome> {
  const businessId = event.externalReference;
  if (!businessId || !UUID_RE.test(businessId)) return 'no_business';
  // Nothing to undo any more: no push (a missing undoUntil is treated as closed, since "Undo" would fail).
  const undoUntilMs = event.undoUntil ? Date.parse(event.undoUntil) : Number.NaN;
  if (!Number.isFinite(undoUntilMs) || undoUntilMs <= deps.clock().getTime()) return 'window_closed';
  const context = await deps.repo.getBusinessContext(businessId);
  if (!context || context.ownerIds.length === 0) return 'no_business';

  const action = await deps.actions?.getAction(event.accountId, event.actionId).catch((error: unknown) => {
    deps.logger.warn('action_title_unavailable', { error });
    return null;
  });
  const devices = await deps.push.toUsers(businessId, context.ownerIds, {
    title: ACTION_PUSH_TITLE,
    body: action?.title || ACTION_FALLBACK_BODY,
    categoryId: ACTION_CATEGORY,
    data: { type: 'action', actionId: event.actionId, businessId, undoUntil: event.undoUntil ?? '' },
  });
  deps.logger.info('action_push', { business_id: businessId, devices });
  return devices > 0 ? 'sent' : 'no_devices';
}
