import type { MeDTO } from '@booking/types';

import { isApiError } from '@/lib/api';

/**
 * Pure checkout logic. Purchase happens in Stripe's hosted page (in-app
 * browser); the plan flips when Stripe's webhook reaches the API, so after the
 * browser closes the app polls `GET /v1/me` until the plan is active.
 */

export type CheckoutPlanId = 'starter' | 'growth' | 'pro';

export const isCheckoutPlan = (id: string): id is CheckoutPlanId =>
  id === 'starter' || id === 'growth' || id === 'pro';

export type CheckoutPhase =
  | { kind: 'idle' }
  /** Creating the checkout session. */
  | { kind: 'starting' }
  /** The hosted page is open. */
  | { kind: 'browser' }
  /** Paid and returned, but the plan is slow to flip (shown only past ~800ms). */
  | { kind: 'confirming' }
  | { kind: 'active' }
  /** The owner stopped waiting ("I didn't pay") on the slow path. */
  | { kind: 'cancelled' }
  /** Polled for the whole budget and the plan did not flip. */
  | { kind: 'unconfirmed' }
  | { kind: 'failed' }
  | { kind: 'offline' }
  /** The API has no payment provider configured (`BILLING_NOT_CONFIGURED`). */
  | { kind: 'not_configured' };

/** Phases that end in a message with a way forward. */
export type CheckoutProblem = Extract<
  CheckoutPhase,
  {
    kind: 'cancelled' | 'unconfirmed' | 'failed' | 'offline' | 'not_configured';
  }
>;

export const isCheckoutProblem = (p: CheckoutPhase): p is CheckoutProblem =>
  p.kind === 'cancelled' ||
  p.kind === 'unconfirmed' ||
  p.kind === 'failed' ||
  p.kind === 'offline' ||
  p.kind === 'not_configured';

/** A paid plan, or any plan that carries the companion; `none` and `free` are not active. */
export function isPlanActive(me: Pick<MeDTO, 'plan' | 'features'>): boolean {
  if (me.features.some((f) => f.feature === 'companion')) return true;
  return me.plan === 'starter' || me.plan === 'growth' || me.plan === 'pro';
}

const isOfflineError = (error: unknown): boolean =>
  isApiError(error) &&
  (error.code === 'OFFLINE' || error.code === 'NETWORK_ERROR');

/** How the creation of a checkout session failed, as a phase. */
export function phaseForCheckoutError(error: unknown): CheckoutProblem {
  if (isApiError(error) && error.code === 'BILLING_NOT_CONFIGURED') {
    return { kind: 'not_configured' };
  }
  return isOfflineError(error) ? { kind: 'offline' } : { kind: 'failed' };
}

export const POLL_BUDGET_MS = 120_000;
/** Right after a successful return the server has usually activated already: poll fast first. */
export const FAST_POLL_MS = 400;
export const FAST_POLL_WINDOW_MS = 8_000;
/** The "Confirming" screen only appears if the plan has not flipped by now. */
export const CONFIRMING_AFTER_MS = 800;
const POLL_FIRST_MS = 1_500;
const POLL_MAX_MS = 10_000;

/** Backoff between polls: 1.5s, 2.3s, 3.4s ... capped at 10s. */
export function pollDelayMs(attempt: number): number {
  return Math.min(POLL_MAX_MS, Math.round(POLL_FIRST_MS * 1.5 ** attempt));
}

/** Whether the auth session ended on our success redirect (not a cancel page or a closed tab). */
export function isCheckoutSuccess(result: {
  type: string;
  url?: string;
}): boolean {
  return (
    result.type === 'success' &&
    !/\/checkout\/cancel(?:[/?#]|$)/.test(result.url ?? '')
  );
}

export type PollOutcome = 'active' | 'timeout' | 'aborted';

export interface PollDeps {
  fetchMe: () => Promise<Pick<MeDTO, 'plan' | 'features'>>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  isAborted: () => boolean;
  budgetMs?: number;
  /** Poll every FAST_POLL_MS for the first FAST_POLL_WINDOW_MS, then back off. */
  isFast?: boolean;
}

/**
 * Asks for `/v1/me` with backoff until the plan is active, the budget is spent
 * or the caller aborts. A failed poll counts as "not yet" (the connection may
 * come back); the last failure is returned so the screen can say "offline"
 * rather than "still confirming".
 */
export async function pollUntilActive(
  deps: PollDeps,
): Promise<{ outcome: PollOutcome; lastError: unknown }> {
  const budget = deps.budgetMs ?? POLL_BUDGET_MS;
  const startedAt = deps.now();
  let lastError: unknown = null;
  let slowAttempt = 0;
  for (;;) {
    if (deps.isAborted()) return { outcome: 'aborted', lastError };
    try {
      const me = await deps.fetchMe();
      lastError = null;
      if (isPlanActive(me)) return { outcome: 'active', lastError };
    } catch (error) {
      lastError = error;
    }
    const isFastNow =
      deps.isFast === true && deps.now() - startedAt < FAST_POLL_WINDOW_MS;
    const delay = isFastNow ? FAST_POLL_MS : pollDelayMs(slowAttempt++);
    if (deps.now() - startedAt + delay > budget) {
      return { outcome: 'timeout', lastError };
    }
    await deps.sleep(delay);
  }
}

/** Where a finished poll leaves the screen. */
export function phaseForPoll(
  outcome: PollOutcome,
  lastError: unknown,
): CheckoutPhase {
  if (outcome === 'active') return { kind: 'active' };
  if (outcome === 'aborted') return { kind: 'cancelled' };
  return isOfflineError(lastError)
    ? { kind: 'offline' }
    : { kind: 'unconfirmed' };
}
