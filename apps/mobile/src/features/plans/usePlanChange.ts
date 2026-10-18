import type {
  ChangePlanRequest,
  ChangePlanResultDTO,
  PlanChangePreviewDTO,
} from '@booking/types';
import { haptics } from '@booking/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import * as React from 'react';

import { api, isApiError } from '@/lib/api';
import { qk, useApiMutation } from '@/lib/query';

import { CONFIRMING_AFTER_MS, type CheckoutPlanId } from './checkout';
import { PAYMENT_FAILED, type ScheduledChange } from './planChange';

export type PlanChangePhase =
  | 'idle'
  | 'working'
  /** The hosted invoice is open or being confirmed past 800ms. */
  | 'confirming'
  | 'success'
  | 'declined'
  | 'failed';

/** The previewed change for `plan`; nothing is fetched while `plan` is null. */
export function usePlanPreview(plan: CheckoutPlanId | null) {
  return useQuery({
    queryKey: qk.planPreview(plan ?? ''),
    queryFn: () => api.previewPlanChange(plan as CheckoutPlanId),
    enabled: plan !== null,
    // The charge is time-sensitive: always show a fresh number.
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

/** The booked downgrade, if any (kept in the query cache from the change response). */
export function useScheduledChange(): ScheduledChange | null {
  const { data } = useQuery<ScheduledChange | null>({
    queryKey: qk.planScheduled,
    queryFn: () => null,
    enabled: false,
    initialData: null,
    staleTime: Infinity,
  });
  return data ?? null;
}

function useRefreshPlan() {
  const qc = useQueryClient();
  return React.useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.me }),
      qc.invalidateQueries({ queryKey: qk.plans }),
      qc.invalidateQueries({ queryKey: ['billing-usage'] }),
    ]);
  }, [qc]);
}

/**
 * Confirms a previewed change. One Idempotency-Key per payload (the api
 * mutation's tracker), a ref guard against double taps, and the three
 * outcomes: active (done), requires_action (hosted invoice in an auth
 * session) and scheduled (a downgrade for the end of the period).
 */
export function usePlanChange(onDone: () => void) {
  const qc = useQueryClient();
  const refresh = useRefreshPlan();
  const [phase, setPhase] = React.useState<PlanChangePhase>('idle');
  const busy = React.useRef(false);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const show = React.useCallback((next: PlanChangePhase) => {
    if (alive.current) setPhase(next);
  }, []);

  const change = useApiMutation<ChangePlanRequest, ChangePlanResultDTO>({
    mutationFn: (vars, key) => api.changePlan(vars, key),
    // The sheet explains the failure itself.
    onError: () => true,
  });

  const settle = React.useCallback(
    async (target: string) => {
      const slow = setTimeout(() => show('confirming'), CONFIRMING_AFTER_MS);
      try {
        await refresh();
        const me = await qc.fetchQuery({
          queryKey: qk.me,
          queryFn: api.me,
          staleTime: 0,
        });
        show(me.plan === target ? 'success' : 'idle');
      } catch {
        show('idle');
      } finally {
        clearTimeout(slow);
      }
    },
    [qc, refresh, show],
  );

  const confirm = React.useCallback(
    async (preview: PlanChangePreviewDTO) => {
      if (busy.current) return;
      busy.current = true;
      haptics.light();
      show('working');
      try {
        const result = await change.mutateAsync({
          plan: preview.plan as CheckoutPlanId,
          proration_date: preview.proration_date ?? undefined,
        });
        if (result.status === 'scheduled') {
          const booked: ScheduledChange = {
            plan: result.plan,
            effective_at: result.effective_at ?? preview.effective_at,
          };
          qc.setQueryData(qk.planScheduled, booked);
          await refresh();
          onDone();
        } else if (result.status === 'requires_action') {
          if (!result.hosted_invoice_url) {
            show('failed');
            return;
          }
          await WebBrowser.openAuthSessionAsync(
            result.hosted_invoice_url,
            Linking.createURL('checkout'),
          );
          await settle(preview.plan);
        } else {
          qc.setQueryData(qk.planScheduled, null);
          await refresh();
          show('success');
        }
      } catch (error) {
        show(
          isApiError(error) && (error.code as string) === PAYMENT_FAILED
            ? 'declined'
            : 'failed',
        );
      } finally {
        busy.current = false;
      }
    },
    [change, onDone, qc, refresh, settle, show],
  );

  const reset = React.useCallback(() => show('idle'), [show]);
  return { phase, confirm, reset };
}

/** "Keep Pro": re-selecting the current plan cancels the booked downgrade. */
export function useKeepPlan() {
  const qc = useQueryClient();
  const refresh = useRefreshPlan();
  return useApiMutation<CheckoutPlanId>({
    mutationFn: (plan, key) => api.changePlan({ plan }, key),
    onSuccess: () => {
      qc.setQueryData(qk.planScheduled, null);
      void refresh();
    },
  });
}
