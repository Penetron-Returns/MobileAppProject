import type { CheckoutSessionDTO, MeDTO } from '@booking/types';
import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import * as React from 'react';

import type { CheckoutOutcome } from '@/features/analytics/events';
import { api, isApiError } from '@/lib/api';
import { qk, useApiMutation } from '@/lib/query';

import {
  CONFIRMING_AFTER_MS,
  isCheckoutSuccess,
  isPlanActive,
  phaseForCheckoutError,
  phaseForPoll,
  pollUntilActive,
  type CheckoutPhase,
  type CheckoutPlanId,
} from './checkout';

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface CheckoutOptions {
  /** Once per attempt, when it ends: how, and which plan was being bought. */
  onReturned?: (outcome: CheckoutOutcome, plan: CheckoutPlanId | null) => void;
  /** The plan is active (however it was noticed). The app's gate routes on by itself. */
  onActivated?: (plan: CheckoutPlanId | null) => void;
}

/**
 * Starts a plan: asks the API for a checkout session (one Idempotency-Key per
 * attempt), opens our checkout page in an auth browser session and waits for
 * its redirect to `<scheme>://checkout/success`. The server has activated the
 * plan before that redirect, so one uncached `/v1/me` normally unlocks the app
 * at once; only a slow flip shows "Confirming", and only past 800ms.
 * Closing the tab goes straight back to the plans (one quiet refetch in case
 * they paid and closed early).
 */
export function useCheckout(options: CheckoutOptions = {}) {
  const qc = useQueryClient();
  const planRef = React.useRef<CheckoutPlanId | null>(null);
  const optionsRef = React.useRef(options);
  optionsRef.current = options;
  const [phase, setPhase] = React.useState<CheckoutPhase>({ kind: 'idle' });
  // Every attempt (and every stop) takes a new number; work for an older number
  // can neither change the screen nor keep polling.
  const attemptRef = React.useRef(0);
  const busyRef = React.useRef<number | null>(null);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const isCurrent = React.useCallback(
    (attempt: number) => alive.current && attempt === attemptRef.current,
    [],
  );
  const show = React.useCallback(
    (attempt: number, next: CheckoutPhase) => {
      if (isCurrent(attempt)) setPhase(next);
    },
    [isCurrent],
  );

  const create = useApiMutation<
    { plan: CheckoutPlanId; returnUrl: string },
    CheckoutSessionDTO
  >({
    mutationFn: ({ plan, returnUrl }, key) =>
      api.createCheckout({ plan, return_url: returnUrl }, key),
    // The screen explains the failure itself.
    onError: () => true,
  });

  const fetchMe = React.useCallback(
    (): Promise<MeDTO> =>
      qc.fetchQuery({ queryKey: qk.me, queryFn: api.me, staleTime: 0 }),
    [qc],
  );

  const markActive = React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: qk.plans });
    void qc.invalidateQueries({ queryKey: ['billing-usage'] });
    optionsRef.current.onActivated?.(planRef.current);
  }, [qc]);

  const confirm = React.useCallback(
    async (attempt: number, isFast: boolean) => {
      // The plan list stays up for the first moments: a spinner-free beat that
      // only turns into "Confirming" if the flip is slow.
      const slowTimer = setTimeout(
        () => show(attempt, { kind: 'confirming' }),
        isFast ? CONFIRMING_AFTER_MS : 0,
      );
      const { outcome, lastError } = await pollUntilActive({
        fetchMe,
        now: Date.now,
        sleep,
        isAborted: () => !isCurrent(attempt),
        isFast,
      });
      clearTimeout(slowTimer);
      // A plan that really is active is worth recording even if the screen moved on.
      if (outcome === 'active') markActive();
      if (!isCurrent(attempt)) return;
      optionsRef.current.onReturned?.(
        outcome === 'active' ? 'success' : outcome,
        planRef.current,
      );
      show(attempt, phaseForPoll(outcome, lastError));
    },
    [fetchMe, isCurrent, markActive, show],
  );

  /** Closed the tab: back to the plans, and one quiet look in case they paid first. */
  const handleClosed = React.useCallback(
    (attempt: number) => {
      show(attempt, { kind: 'idle' });
      optionsRef.current.onReturned?.('cancel', planRef.current);
      void fetchMe()
        .then((me) => {
          if (isPlanActive(me)) markActive();
        })
        .catch(() => undefined);
    },
    [fetchMe, markActive, show],
  );

  const handleCreateError = React.useCallback(
    async (attempt: number, error: unknown) => {
      if (
        isApiError(error) &&
        error.code === 'RULE_VIOLATION' &&
        error.details?.rule === 'ALREADY_SUBSCRIBED'
      ) {
        // Already paid (another device, an earlier attempt): the gate routes on.
        try {
          const me = await fetchMe();
          if (isPlanActive(me)) {
            markActive();
            show(attempt, { kind: 'idle' });
            return;
          }
        } catch {
          // fall through to the plain failure
        }
        show(attempt, { kind: 'failed' });
        return;
      }
      show(attempt, phaseForCheckoutError(error));
    },
    [fetchMe, markActive, show],
  );

  const start = React.useCallback(
    async (plan: CheckoutPlanId) => {
      if (busyRef.current !== null && busyRef.current === attemptRef.current) {
        return; // a double tap
      }
      const attempt = ++attemptRef.current;
      busyRef.current = attempt;
      planRef.current = plan;
      try {
        show(attempt, { kind: 'starting' });
        let session: CheckoutSessionDTO;
        try {
          session = await create.mutateAsync({
            plan,
            returnUrl: Linking.createURL('checkout/success'),
          });
        } catch (error) {
          await handleCreateError(attempt, error);
          return;
        }
        if (!isCurrent(attempt)) return;
        show(attempt, { kind: 'browser' });
        let result: WebBrowser.WebBrowserAuthSessionResult;
        try {
          result = await WebBrowser.openAuthSessionAsync(
            session.checkout_url,
            Linking.createURL('checkout'),
          );
        } catch {
          show(attempt, { kind: 'failed' });
          return;
        }
        if (!isCurrent(attempt)) return;
        if (isCheckoutSuccess(result)) await confirm(attempt, true);
        else handleClosed(attempt);
      } finally {
        if (busyRef.current === attempt) busyRef.current = null;
      }
    },
    [create, confirm, handleClosed, handleCreateError, isCurrent, show],
  );

  /** "Check again" after a slow confirmation: the slow poll, not the fast one. */
  const checkAgain = React.useCallback(() => {
    const attempt = ++attemptRef.current;
    return confirm(attempt, false);
  }, [confirm]);

  /** "I didn't pay": stop waiting. */
  const notPaid = React.useCallback(() => {
    const attempt = ++attemptRef.current;
    show(attempt, { kind: 'cancelled' });
  }, [show]);

  const reset = React.useCallback(() => {
    const attempt = ++attemptRef.current;
    show(attempt, { kind: 'idle' });
  }, [show]);

  return { phase, start, checkAgain, notPaid, reset };
}
