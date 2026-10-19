/**
 * Self-service account deletion (Google Play and App Store policy). The deletion itself reuses the existing
 * Clerk webhook path: this service deletes the Clerk user (and, for the sole owner who confirms by typing the
 * business name, the Clerk organisation) and the `user.deleted` / `organization.deleted` webhooks cascade through
 * `handleClerkEvent` (users row, staff link, business and its data). What cannot wait for the webhook is done here:
 * Expo push tokens are revoked at once, the linked staff row (kept because appointments
 * reference it) is anonymised, and the deletion is audited in `audit_log` (entity `account`; history outlives the business).
 * Clerk goes first, so a failure leaves local data untouched and the owner can retry.
 */
import type { AccountDeletionPreviewDTO, DeleteAccountResultDTO, MemberRole, UUID } from '@booking/types';
import { notFound, ruleViolation } from '../../lib/errors.ts';
import type { ClerkAdmin } from '../ports.ts';
import type { BookingRepository } from '../../repositories/types.ts';

export interface AccountCaller {
  userId: string;
  orgId: string;
  businessId: UUID;
  role: MemberRole;
  requestId?: string;
}

export interface AccountDeps {
  repo: BookingRepository;
  clerk: ClerkAdmin;
}

/** What replaces a deleted person's name on the staff row that old appointments still point at. */
export const FORMER_STAFF_NAME = 'Former team member';

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function previewAccountDeletion(deps: AccountDeps, caller: AccountCaller): Promise<AccountDeletionPreviewDTO> {
  const [business, members] = await Promise.all([deps.repo.getBusiness(caller.businessId), deps.clerk.listMembers(caller.orgId)]);
  if (!business) throw notFound('Business');
  const others = members.filter((m) => m.userId !== caller.userId);
  const soleOwner = caller.role === 'owner' && !others.some((m) => m.role === 'owner');
  return { business_deleted: soleOwner, business_name: business.name, other_member_count: others.length };
}

/** Removes the person's data from the business but keeps the staff row, anonymised, for appointment history. */
async function anonymiseStaff(deps: AccountDeps, caller: AccountCaller) {
  const staff = await deps.repo.findStaffByUserId(caller.businessId, caller.userId);
  if (!staff) return;
  await deps.repo.updateStaff(caller.businessId, staff.id, {
    user_id: null,
    name: FORMER_STAFF_NAME,
    title: null,
    photo_url: null,
    phone: null,
    email: null,
    is_active: false,
    accepts_bookings: false,
  });
}

function audit(deps: AccountDeps, caller: AccountCaller, businessDeleted: boolean) {
  return deps.repo.recordAudit({
    businessId: caller.businessId,
    actorId: caller.userId,
    action: 'delete',
    entity: 'account',
    entityId: caller.userId,
    diff: { role: caller.role, business_deleted: businessDeleted },
    ...(caller.requestId ? { requestId: caller.requestId } : {}),
  });
}

export async function deleteAccount(
  deps: AccountDeps,
  caller: AccountCaller,
  input: { confirmBusinessName?: string },
): Promise<DeleteAccountResultDTO> {
  const preview = await previewAccountDeletion(deps, caller);
  if (preview.business_deleted && !sameName(input.confirmBusinessName ?? '', preview.business_name)) {
    throw ruleViolation('BUSINESS_NAME_MISMATCH', 'Type the business name exactly to delete the business and your account');
  }

  await deps.repo.deleteDeviceTokensForUser(caller.userId);
  if (preview.business_deleted) await deps.clerk.deleteOrganization(caller.orgId);
  await deps.clerk.deleteUser(caller.userId);

  await audit(deps, caller, preview.business_deleted);
  // A deleted business takes its staff rows with it (webhook); otherwise keep the row for history, minus the person.
  if (!preview.business_deleted) await anonymiseStaff(deps, caller);
  return { deleted: true, business_deleted: preview.business_deleted };
}
