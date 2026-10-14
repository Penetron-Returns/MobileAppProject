import type { MemberRole, TeamDTO } from '@booking/types';
import { useQuery } from '@tanstack/react-query';

import { useCanManage } from '@/features/business/me';
import { api } from '@/lib/api';
import i18n from '@/lib/i18n';
import { qk, useApiMutation, type MutationCallbacks } from '@/lib/query';
import { supabase, unwrap } from '@/lib/supabase';
import { toast } from '@/lib/toast';

import { teamErrorKey } from './logic';
import type { AvailabilityRule } from './schedule';

/**
 * Team-specific wording for the rules and refusals the team routes return
 * (last owner, already invited, ...). True when it showed a message, so the
 * generic error toast is skipped.
 */
function handleTeamError(
  error: unknown,
  next?: (error: unknown) => boolean | void,
): boolean {
  const key = teamErrorKey(error);
  if (key) {
    toast.failed(i18n.t(key), error);
    return true;
  }
  return Boolean(next?.(error));
}

/** Logins and pending invitations of the business. Owner only: the API refuses staff. */
export function useTeam() {
  const canManage = useCanManage();
  return useQuery<TeamDTO>({
    queryKey: qk.team,
    queryFn: api.team,
    enabled: canManage,
  });
}

export interface StaffAvailabilityRow extends AvailabilityRule {
  staff_id: string;
}

async function fetchAvailabilityRules(): Promise<StaffAvailabilityRow[]> {
  return unwrap(
    await supabase
      .from('availability_rules')
      .select('staff_id, weekday, start_time, end_time'),
  );
}

/** Every weekly availability rule of the business (RLS-scoped), for the working-days view. */
export function useAvailabilityRules() {
  return useQuery({
    queryKey: qk.staffRules('all'),
    queryFn: fetchAvailabilityRules,
  });
}

export interface InviteInput {
  email: string;
  role: MemberRole;
  staffId?: string | null;
}

export function useCreateInvitation(
  opts: {
    onSuccess?: (invite: InviteInput) => void;
    onError?: MutationCallbacks['onError'];
  } = {},
) {
  return useApiMutation<InviteInput>({
    mutationFn: ({ email, role, staffId }, key) =>
      api.createInvitation(
        { email, role, ...(staffId ? { staff_id: staffId } : {}) },
        key,
      ),
    invalidate: [qk.team, qk.staff],
    onSuccess: (_invitation, vars) => opts.onSuccess?.(vars),
    onError: (error) => handleTeamError(error, opts.onError),
  });
}

export function useRevokeInvitation(opts: MutationCallbacks = {}) {
  return useApiMutation<string>({
    mutationFn: (invitationId, key) => api.revokeInvitation(invitationId, key),
    invalidate: [qk.team],
    onSuccess: opts.onSuccess,
    onError: (error) => handleTeamError(error, opts.onError),
  });
}

export function useUpdateMemberRole(opts: MutationCallbacks = {}) {
  return useApiMutation<{ userId: string; role: MemberRole }>({
    mutationFn: ({ userId, role }, key) =>
      api.updateMemberRole(userId, { role }, key),
    // The caller's own role may have changed: /v1/me decides what they may open.
    invalidate: [qk.team, qk.me],
    onSuccess: opts.onSuccess,
    onError: (error) => handleTeamError(error, opts.onError),
  });
}

export function useRemoveMember(opts: MutationCallbacks = {}) {
  return useApiMutation<string>({
    mutationFn: (userId, key) => api.removeMember(userId, key),
    invalidate: [qk.team, qk.staff],
    onSuccess: opts.onSuccess,
    onError: (error) => handleTeamError(error, opts.onError),
  });
}
