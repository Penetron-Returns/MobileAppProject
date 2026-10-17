import type { MeDTO } from '@booking/types';

import { ApiError } from '@/lib/api';

import {
  isCheckoutPlan,
  isCheckoutProblem,
  isPlanActive,
  phaseForCheckoutError,
  phaseForPoll,
  POLL_BUDGET_MS,
  pollDelayMs,
  pollUntilActive,
} from '../checkout';

type MeFacts = Pick<MeDTO, 'plan' | 'features'>;
const none: MeFacts = { plan: 'none', features: [] };
const growth: MeFacts = {
  plan: 'growth',
  features: [{ feature: 'companion', monthly_limit: null }],
};

const apiError = (code: string, status = 400) =>
  new ApiError({ code: code as never, message: 'x', status });

describe('isPlanActive', () => {
  it.each([
    ['none, nothing', none, false],
    ['free, nothing', { plan: 'free', features: [] } as MeFacts, false],
    ['starter', { plan: 'starter', features: [] } as MeFacts, true],
    ['pro', { plan: 'pro', features: [] } as MeFacts, true],
    [
      'any plan that carries the companion',
      { plan: 'free', features: growth.features } as MeFacts,
      true,
    ],
  ])('%s -> %s', (_name, me, expected) => {
    expect(isPlanActive(me)).toBe(expected);
  });
});

describe('isCheckoutPlan', () => {
  it('accepts the three paid tiers only', () => {
    expect(['starter', 'growth', 'pro'].every(isCheckoutPlan)).toBe(true);
    expect(isCheckoutPlan('free')).toBe(false);
    expect(isCheckoutPlan('none')).toBe(false);
  });
});

describe('phaseForCheckoutError', () => {
  it.each([
    [
      'payments not configured',
      apiError('BILLING_NOT_CONFIGURED', 503),
      'not_configured',
    ],
    ['offline', apiError('OFFLINE', 0), 'offline'],
    ['network error', apiError('NETWORK_ERROR', 0), 'offline'],
    [
      'upstream billing error',
      apiError('UPSTREAM_BILLING_ERROR', 502),
      'failed',
    ],
    ['unknown', new Error('boom'), 'failed'],
  ])('%s -> %s', (_name, error, kind) => {
    expect(phaseForCheckoutError(error)).toEqual({ kind });
  });
});

describe('isCheckoutProblem', () => {
  it('is true for the phases that end in a message', () => {
    for (const kind of [
      'cancelled',
      'unconfirmed',
      'failed',
      'offline',
      'not_configured',
    ] as const) {
      expect(isCheckoutProblem({ kind })).toBe(true);
    }
    for (const kind of [
      'idle',
      'starting',
      'browser',
      'confirming',
      'active',
    ] as const) {
      expect(isCheckoutProblem({ kind })).toBe(false);
    }
  });
});

describe('pollDelayMs', () => {
  it('backs off and caps at ten seconds', () => {
    const delays = [0, 1, 2, 3, 4, 5, 6, 20].map(pollDelayMs);
    expect(delays[0]).toBe(1500);
    expect(delays.slice(0, 5)).toEqual(
      [...delays.slice(0, 5)].sort((a, b) => a - b),
    );
    expect(Math.max(...delays)).toBe(10_000);
    expect(delays.at(-1)).toBe(10_000);
  });
});

/** A fake clock: sleeping advances it, so the budget is spent without waiting. */
function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: (ms: number) => {
      t += ms;
      return Promise.resolve();
    },
  };
}

describe('pollUntilActive', () => {
  it('stops as soon as the plan is active', async () => {
    const c = clock();
    const fetchMe = jest
      .fn<Promise<MeFacts>, []>()
      .mockResolvedValueOnce(none)
      .mockResolvedValueOnce(none)
      .mockResolvedValueOnce(growth);
    const result = await pollUntilActive({
      ...c,
      fetchMe,
      isAborted: () => false,
    });
    expect(result).toEqual({ outcome: 'active', lastError: null });
    expect(fetchMe).toHaveBeenCalledTimes(3);
  });

  it('gives up after the budget with "timeout", and never polls past it', async () => {
    const c = clock();
    const fetchMe = jest.fn<Promise<MeFacts>, []>().mockResolvedValue(none);
    const result = await pollUntilActive({
      ...c,
      fetchMe,
      isAborted: () => false,
    });
    expect(result.outcome).toBe('timeout');
    expect(c.now()).toBeLessThanOrEqual(POLL_BUDGET_MS);
    expect(fetchMe.mock.calls.length).toBeGreaterThan(5);
  });

  it('survives a failed poll and still succeeds when the connection returns', async () => {
    const c = clock();
    const fetchMe = jest
      .fn<Promise<MeFacts>, []>()
      .mockRejectedValueOnce(apiError('NETWORK_ERROR', 0))
      .mockResolvedValueOnce(growth);
    const result = await pollUntilActive({
      ...c,
      fetchMe,
      isAborted: () => false,
    });
    expect(result.outcome).toBe('active');
  });

  it('returns the last failure so the screen can say offline', async () => {
    const c = clock();
    const error = apiError('NETWORK_ERROR', 0);
    const fetchMe = jest.fn<Promise<MeFacts>, []>().mockRejectedValue(error);
    const result = await pollUntilActive({
      ...c,
      fetchMe,
      isAborted: () => false,
    });
    expect(result).toEqual({ outcome: 'timeout', lastError: error });
  });

  it('stops when aborted, before asking again', async () => {
    const c = clock();
    const fetchMe = jest.fn<Promise<MeFacts>, []>().mockResolvedValue(none);
    let calls = 0;
    const result = await pollUntilActive({
      ...c,
      fetchMe,
      isAborted: () => calls++ >= 2,
    });
    expect(result.outcome).toBe('aborted');
    expect(fetchMe).toHaveBeenCalledTimes(2);
  });
});

describe('phaseForPoll', () => {
  it.each([
    ['active', null, 'active'],
    ['aborted', null, 'cancelled'],
    ['timeout', null, 'unconfirmed'],
    ['timeout', apiError('NETWORK_ERROR', 0), 'offline'],
    ['timeout', apiError('INTERNAL', 500), 'unconfirmed'],
  ] as const)('%s with %s -> %s', (outcome, lastError, kind) => {
    expect(phaseForPoll(outcome, lastError)).toEqual({ kind });
  });
});
