import type { CompanionSettingsDTO } from '@booking/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { api, type CompanionSettingsPatch } from '@/lib/api';
import { qk, useApiMutation } from '@/lib/query';
import { toast } from '@/lib/toast';

export type ApprovalPolicy = CompanionSettingsDTO['approvalPolicy'];

/** "Ask me first", in the order shown. `risky_only` is the recommended default. */
export const APPROVAL_POLICIES: readonly ApprovalPolicy[] = [
  'always',
  'risky_only',
  'never',
];
export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = 'risky_only';

/** "Time to undo" choices in seconds; 0 is Off. */
export const UNDO_WINDOW_OPTIONS = [0, 15, 30, 60, 120] as const;
export const DEFAULT_UNDO_WINDOW_SECONDS = 30;

/** The settings as they would be with `patch` applied (the optimistic value). */
export function applyPatch(
  settings: CompanionSettingsDTO,
  patch: CompanionSettingsPatch,
): CompanionSettingsDTO {
  return { ...settings, ...patch };
}

/** The values `patch` replaced, to put back when the save fails. */
export function revertPatch(
  previous: CompanionSettingsDTO,
  patch: CompanionSettingsPatch,
): CompanionSettingsPatch {
  const revert: CompanionSettingsPatch = {};
  if (patch.approvalPolicy !== undefined) {
    revert.approvalPolicy = previous.approvalPolicy;
  }
  if (patch.undoWindowSeconds !== undefined) {
    revert.undoWindowSeconds = previous.undoWindowSeconds;
  }
  return revert;
}

/** Owner-only (the API answers 403 to staff): pass `enabled: false` for anyone else. */
export function useCompanionSettings(enabled: boolean) {
  return useQuery({
    queryKey: qk.companionSettings,
    queryFn: api.companionSettings,
    enabled,
    // The Nerova settings API may not be live yet: show "Not available yet" rather than retrying.
    retry: false,
    staleTime: 60_000,
  });
}

/**
 * Saves a change at once on screen (optimistic) and puts the old value back, with a toast, if the save fails. One
 * Idempotency-Key per user action comes from `useApiMutation`.
 */
export function useUpdateCompanionSettings() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const mutation = useApiMutation<CompanionSettingsPatch, CompanionSettingsDTO>(
    {
      mutationFn: (patch, key) => api.updateCompanionSettings(patch, key),
      onSuccess: (saved) => qc.setQueryData(qk.companionSettings, saved),
      // The caller below reports it once, so the default toast is not shown too.
      onError: () => true,
    },
  );
  const { mutateAsync } = mutation;

  const update = React.useCallback(
    async (patch: CompanionSettingsPatch) => {
      const previous = qc.getQueryData<CompanionSettingsDTO>(
        qk.companionSettings,
      );
      if (!previous) return;
      qc.setQueryData(qk.companionSettings, applyPatch(previous, patch));
      try {
        await mutateAsync(patch);
      } catch (error) {
        qc.setQueryData<CompanionSettingsDTO>(
          qk.companionSettings,
          (current) =>
            current && applyPatch(current, revertPatch(previous, patch)),
        );
        toast.failed(
          t('settings.companionSettings.bookings.saveFailed'),
          error,
        );
      }
    },
    [qc, mutateAsync, t],
  );

  return { update, isSaving: mutation.isPending };
}
