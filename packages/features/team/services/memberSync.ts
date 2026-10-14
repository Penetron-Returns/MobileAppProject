/**
 * Session-time sync of a Clerk org member into users + staff. Runs from requireAuth
 * so linking works without the Clerk webhook: the first authed call of an invited
 * login mirrors the user (role from the verified token) and links its staff row.
 */
import type { MemberRole, UUID } from '@booking/types';
import type { Logger } from '../../lib/logger.ts';
import type { ClerkAdmin, ClerkOrgMember } from '../../ports.ts';
import { ensureMember } from './clerkSync.ts';
import type { BookingRepository } from '../../repositories/types.ts';

const SYNCED_MS = 5 * 60_000;
// Per repository (= per database client), so isolated test repositories never share state.
const synced = new WeakMap<object, Map<string, number>>();

export interface SessionMember {
  userId: string;
  orgId: string;
  businessId: UUID;
  role: MemberRole;
}

export async function syncSessionMember(
  deps: { repo: BookingRepository; clerk: ClerkAdmin; logger: Logger; now?: () => number },
  member: SessionMember,
): Promise<void> {
  const { repo, clerk, logger } = deps;
  const now = (deps.now ?? Date.now)();
  const cache = synced.get(repo) ?? new Map<string, number>();
  synced.set(repo, cache);
  const key = `${member.userId}|${member.businessId}|${member.role}`;
  if ((cache.get(key) ?? 0) + SYNCED_MS > now) return;

  const [user, staff, business] = await Promise.all([
    repo.getUser(member.userId),
    repo.findStaffByUserId(member.businessId, member.userId),
    repo.getBusiness(member.businessId),
  ]);
  if (!business) return;
  if (user?.business_id === member.businessId && user.role === member.role && staff) {
    cache.set(key, now);
    return;
  }

  let profile: ClerkOrgMember | null = null;
  let profileKnown = true;
  if (!staff) {
    try {
      profile = await clerk.getMember(member.orgId, member.userId);
    } catch {
      profileKnown = false;
      logger.warn('member_sync_profile_unavailable');
    }
  }
  await ensureMember(
    repo,
    business,
    {
      userId: member.userId,
      role: member.role,
      email: profile?.email ?? user?.email ?? null,
      displayName: profile?.name ?? user?.display_name ?? null,
      avatarUrl: profile?.imageUrl ?? user?.avatar_url ?? null,
      staffId: profile?.staffId ?? null,
    },
    // Without the Clerk profile a created row would carry a placeholder name and skip the invite link: retry next request.
    { createStaff: !staff && profileKnown },
  );
  if (profileKnown) cache.set(key, now);
  logger.info('member_synced', { linked_staff: !staff && profileKnown });
}
