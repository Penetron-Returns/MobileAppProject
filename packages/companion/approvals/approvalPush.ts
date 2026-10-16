/**
 * Turns a Nerova `approval.requested` delivery into an Expo push to the business owners.
 * The webhook is thin (ids only), so the title comes from Nerova's pending-approvals read. Owners only: the
 * team model has no per-staff approval permission. The pushed text is the approval title (a service and a time),
 * never a client name or phone number.
 */
import type { Logger } from '@booking/features/lib/logger.ts';
import type { AttendancePush, AttendanceRepository } from '@booking/features/attendance/ports.ts';
import type { NerovaApprovalsClient } from '../nerova/approvals.ts';

/** Notification category registered by the app (Approve / Decline buttons). */
export const APPROVAL_CATEGORY = 'clovie_approval';
export const APPROVAL_PUSH_TITLE = 'Clovie needs your OK';
const APPROVAL_FALLBACK_BODY = 'Open Clovie to review a change';

export interface ApprovalRequestedObject {
  accountId: string;
  approvalId: string;
  kind: string;
  expiresAt: string | null;
  /** Our business id (the Nerova external reference); null when Nerova has none */
  externalReference: string | null;
}

export type ApprovalPushOutcome = 'sent' | 'no_business' | 'not_pending' | 'no_devices';

export interface ApprovalPushDeps {
  /** Null when NEROVA_API_KEY is unset */
  approvals: NerovaApprovalsClient | null;
  repo: Pick<AttendanceRepository, 'getBusinessContext'>;
  push: AttendancePush;
  logger: Logger;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function notifyApprovalRequested(deps: ApprovalPushDeps, event: ApprovalRequestedObject): Promise<ApprovalPushOutcome> {
  const businessId = event.externalReference;
  if (!businessId || !UUID_RE.test(businessId) || !deps.approvals) return 'no_business';
  const context = await deps.repo.getBusinessContext(businessId);
  if (!context || context.ownerIds.length === 0) return 'no_business';

  const approval = await deps.approvals.findPendingApproval(event.accountId, event.approvalId);
  // Decided or expired between the delivery and the read: nothing to ask the owner.
  if (!approval) return 'not_pending';

  const devices = await deps.push.toUsers(businessId, context.ownerIds, {
    title: APPROVAL_PUSH_TITLE,
    body: approval.title || APPROVAL_FALLBACK_BODY,
    categoryId: APPROVAL_CATEGORY,
    data: { type: 'approval', approvalId: approval.id, businessId },
  });
  deps.logger.info('approval_push', { business_id: businessId, devices });
  return devices > 0 ? 'sent' : 'no_devices';
}
