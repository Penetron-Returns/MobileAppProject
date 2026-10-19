import type {
  AttendanceCheckDTO,
  AttendanceMode,
  AttendanceOutcome,
  AttendancePendingResponse,
  MeDTO,
} from '@booking/types';
import {
  onlineManager,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { api, isApiError, newIdempotencyKey } from '@/lib/api';
import { offlineError } from '@/lib/offline';
import { qk } from '@/lib/query';
import { toast } from '@/lib/toast';

import { attendanceIdempotencyKey, withoutCheck } from './logic';

/** A stable empty list: a fresh `[]` every render would re-render every consumer. */
const NO_CHECKS: AttendanceCheckDTO[] = [];

export function useAttendancePending(enabled = true) {
  return useQuery({
    queryKey: qk.attendance,
    queryFn: api.attendancePending,
    enabled,
  });
}

interface AnswerVars {
  checkId: string;
  outcome: AttendanceOutcome;
}

/**
 * Answers a question: the row leaves the list at once and comes back when the
 * API refuses. Used by the app and by the notification actions.
 */
export function useAnswerAttendance() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation<
    AttendanceCheckDTO,
    unknown,
    AnswerVars,
    { previous?: AttendancePendingResponse }
  >({
    networkMode: 'always',
    // The key is deterministic per (check, answer) and the API treats a repeat as a no-op,
    // so a dropped or timed-out request is safe to resend: it settles whether it was saved.
    retry: (count, err) => count < 2 && isApiError(err) && err.isRetryable,
    retryDelay: (attempt) => 600 * (attempt + 1),
    mutationFn: ({ checkId, outcome }) =>
      api.answerAttendance(
        checkId,
        { outcome },
        attendanceIdempotencyKey(checkId, outcome),
      ),
    onMutate: async ({ checkId }) => {
      await queryClient.cancelQueries({ queryKey: qk.attendance });
      const previous = queryClient.getQueryData<AttendancePendingResponse>(
        qk.attendance,
      );
      if (previous) {
        queryClient.setQueryData(
          qk.attendance,
          withoutCheck(previous, checkId),
        );
      }
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(qk.attendance, context.previous);
      }
      // The reason (no connection, signed out, already answered) says whether to just try again.
      toast.error(error, t('attendance.answerFailed'));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.attendance });
      void queryClient.invalidateQueries({ queryKey: qk.appointments });
      void queryClient.invalidateQueries({ queryKey: qk.dashboardAll });
    },
  });
}

/**
 * The caller's open questions plus `answer`, which shows the follow-up line
 * ("Marked Thandi as came"). It stays until the next answer replaces it or
 * the screen is left, so it is never missed; it is dropped if the answer fails.
 */
export function useAttendance(enabled = true) {
  const { t } = useTranslation();
  const pending = useAttendancePending(enabled);
  const { mutateAsync } = useAnswerAttendance();
  const [confirmation, setConfirmation] = React.useState<string | null>(null);

  const answer = React.useCallback(
    async (check: AttendanceCheckDTO, outcome: AttendanceOutcome) => {
      if (!onlineManager.isOnline()) {
        toast.error(offlineError());
        return false;
      }
      const key =
        outcome === 'came'
          ? 'attendance.markedCame'
          : 'attendance.markedNoShow';
      setConfirmation(t(key, { name: check.client_first_name }));
      try {
        await mutateAsync({ checkId: check.id, outcome });
        return true;
      } catch {
        setConfirmation(null);
        return false;
      }
    },
    [mutateAsync, t],
  );

  return {
    checks: pending.data?.checks ?? NO_CHECKS,
    isLoading: pending.isPending,
    isError: pending.isError,
    error: pending.error,
    refetch: pending.refetch,
    confirmation,
    answer,
  };
}

/** Who confirms attendance, with an optimistic write that rolls back on error. */
export function useSetAttendanceMode() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation<unknown, unknown, AttendanceMode, { previous?: MeDTO }>({
    networkMode: 'always',
    mutationFn: (mode) =>
      api.updateBusiness({ attendance_mode: mode }, newIdempotencyKey()),
    onMutate: async (mode) => {
      await queryClient.cancelQueries({ queryKey: qk.me });
      const previous = queryClient.getQueryData<MeDTO>(qk.me);
      if (previous) {
        queryClient.setQueryData<MeDTO>(qk.me, {
          ...previous,
          business: { ...previous.business, attendance_mode: mode },
        });
      }
      return { previous };
    },
    onError: (error, _mode, context) => {
      if (context?.previous) queryClient.setQueryData(qk.me, context.previous);
      toast.failed(t('attendance.setting.saveFailed'), error);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.me });
      void queryClient.invalidateQueries({ queryKey: qk.business });
    },
  });
}
