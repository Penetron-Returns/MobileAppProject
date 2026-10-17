import type { CheckoutSessionDTO } from '@booking/types';
import { useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import * as React from 'react';

import { api } from '@/lib/api';
import { qk, useApiMutation } from '@/lib/query';

import {
  phaseForCheckoutError,
  phaseForPoll,
  pollUntilActive,
  type CheckoutPhase,
  type CheckoutPlanId,
  type PollOutcome,
} from './checkout';

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface CheckoutOptions {
  /** After each confirmation poll ends: how it ended and which plan was being bought. */
  onReturned?: (outcome: PollOutcome, plan: CheckoutPlanId | null) => void;
}

/**
 * Starts a plan: asks the API for a checkout session (one Idempotency-Key per
 * attempt), opens it in the in-app browser, then polls `/v1/me` until the plan
 * is active. The screen renders `phase`; every non-happy phase has a way on.
 */
export function useCheckout(options: CheckoutOptions = {}) {
  const qc = useQueryClient();
  // The plan being bought, so the "returned" callback can name it.
  const planRef = React.useRef<CheckoutPlanId | null>(null);
  const optionsRef = React.useRef(options);
  optionsRef.current = options;
  const [phase, setPhase] = React.useState<CheckoutPhase>({ kind: 'idle' });
  const stopped = React.useRef(false);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopped.current = true;
    };
  }, []);
  const show = React.useCallback((next: CheckoutPhase) => {
    if (alive.current) setPhase(next);
  }, []);

  const create = useApiMutation<CheckoutPlanId, CheckoutSessionDTO>({
    mutationFn: (plan, key) => api.createCheckout({ plan }, key),
    // The screen explains the failure itself.
    onError: () => true,
  });

  const confirm = React.useCallback(async () => {
    stopped.current = false;
    show({ kind: 'confirming' });
    const { outcome, lastError } = await pollUntilActive({
      fetchMe: () =>
        qc.fetchQuery({ queryKey: qk.me, queryFn: api.me, staleTime: 0 }),
      now: Date.now,
      sleep,
      isAborted: () => stopped.current,
    });
    if (outcome === 'active') {
      void qc.invalidateQueries({ queryKey: qk.plans });
      void qc.invalidateQueries({ queryKey: ['billing-usage'] });
    }
    optionsRef.current.onReturned?.(outcome, planRef.current);
    show(phaseForPoll(outcome, lastError));
  }, [qc, show]);

  const start = React.useCallback(
    async (plan: CheckoutPlanId) => {
      planRef.current = plan;
      show({ kind: 'starting' });
      let session: CheckoutSessionDTO;
      try {
        session = await create.mutateAsync(plan);
      } catch (error) {
        show(phaseForCheckoutError(error));
        return;
      }
      show({ kind: 'browser' });
      try {
        await WebBrowser.openBrowserAsync(session.checkout_url);
      } catch {
        show({ kind: 'failed' });
        return;
      }
      await confirm();
    },
    [create, confirm, show],
  );

  /** "I didn't pay": stop waiting. */
  const notPaid = React.useCallback(() => {
    stopped.current = true;
    show({ kind: 'cancelled' });
  }, [show]);

  const reset = React.useCallback(() => show({ kind: 'idle' }), [show]);

  return { phase, start, checkAgain: confirm, notPaid, reset };
}
