import * as React from 'react';

import { ApiError } from '@/lib/api';
import { act, mount } from '@/testing/render';

import { useCheckout } from '../useCheckout';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'key-1' }));

const mockCreate = jest.fn();
const mockMe = jest.fn();
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  api: {
    createCheckout: (...a: unknown[]) => mockCreate(...a),
    me: () => mockMe(),
  },
}));
const mockOpen = jest.fn();
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...a: unknown[]) => mockOpen(...a),
}));

type Checkout = ReturnType<typeof useCheckout>;
function harness(options?: Parameters<typeof useCheckout>[0]) {
  const ref: { current: Checkout | null } = { current: null };
  function Probe() {
    ref.current = useCheckout(options);
    return null;
  }
  mount(<Probe />);
  return ref as { current: Checkout };
}

const NONE = { plan: 'none', features: [] };
const GROWTH = {
  plan: 'growth',
  features: [{ feature: 'companion', monthly_limit: null }],
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockCreate.mockResolvedValue({ checkout_url: 'https://pay.example/c/1' });
  mockOpen.mockResolvedValue({ type: 'dismiss' });
});
afterEach(() => jest.useRealTimers());

/** Starts a checkout and lets the fake clock run (a 5xx is retried after a delay). */
const run = (h: { current: Checkout }, plan: 'starter' | 'growth' | 'pro') =>
  act(async () => {
    const started = h.current.start(plan);
    await jest.advanceTimersByTimeAsync(5000);
    await started;
  });

const settle = () => act(async () => jest.advanceTimersByTimeAsync(0));

describe('useCheckout', () => {
  it('asks for a session with an Idempotency-Key, opens it, then confirms once the plan is active', async () => {
    mockMe.mockResolvedValueOnce(NONE).mockResolvedValue(GROWTH);
    const h = harness();
    expect(h.current.phase.kind).toBe('idle');

    let done!: Promise<void>;
    act(() => {
      done = h.current.start('growth');
    });
    await settle();
    expect(mockCreate).toHaveBeenCalledWith({ plan: 'growth' }, 'key-1');
    expect(mockOpen).toHaveBeenCalledWith('https://pay.example/c/1');
    expect(h.current.phase.kind).toBe('confirming');

    await act(async () => {
      await jest.advanceTimersByTimeAsync(5000);
      await done;
    });
    expect(h.current.phase.kind).toBe('active');
  });

  it('tells the caller how the confirmation ended and which plan was bought', async () => {
    mockMe.mockResolvedValue(GROWTH);
    const onReturned = jest.fn();
    const h = harness({ onReturned });
    await run(h, 'growth');
    expect(onReturned).toHaveBeenCalledWith('active', 'growth');
  });

  it('says payments are not switched on when the API has no billing configured', async () => {
    mockCreate.mockRejectedValue(
      new ApiError({
        code: 'BILLING_NOT_CONFIGURED',
        message: 'x',
        status: 503,
      }),
    );
    const h = harness();
    await run(h, 'starter');
    expect(h.current.phase).toEqual({ kind: 'not_configured' });
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('is offline when the session cannot be created without a connection', async () => {
    mockCreate.mockRejectedValue(
      new ApiError({ code: 'NETWORK_ERROR', message: 'x', status: 0 }),
    );
    const h = harness();
    await run(h, 'starter');
    expect(h.current.phase).toEqual({ kind: 'offline' });
  });

  it('fails plainly when the browser cannot open', async () => {
    mockOpen.mockRejectedValue(new Error('no browser'));
    const h = harness();
    await run(h, 'pro');
    expect(h.current.phase).toEqual({ kind: 'failed' });
  });

  it('lets the owner say they did not pay, and stops waiting', async () => {
    mockMe.mockResolvedValue(NONE);
    const h = harness();
    act(() => void h.current.start('growth'));
    await settle();
    expect(h.current.phase.kind).toBe('confirming');
    act(() => h.current.notPaid());
    expect(h.current.phase).toEqual({ kind: 'cancelled' });
    await act(async () => jest.advanceTimersByTimeAsync(30_000));
    expect(h.current.phase).toEqual({ kind: 'cancelled' });
  });

  it('ends in "still confirming" with a retry when the plan never flips, then confirms on Check again', async () => {
    mockMe.mockResolvedValue(NONE);
    const h = harness();
    act(() => void h.current.start('growth'));
    await act(async () => jest.advanceTimersByTimeAsync(130_000));
    expect(h.current.phase).toEqual({ kind: 'unconfirmed' });

    mockMe.mockResolvedValue(GROWTH);
    await act(async () => h.current.checkAgain());
    expect(h.current.phase).toEqual({ kind: 'active' });
  });

  it('reports offline when the confirmation polls fail for the whole budget', async () => {
    mockMe.mockRejectedValue(
      new ApiError({ code: 'NETWORK_ERROR', message: 'x', status: 0 }),
    );
    const h = harness();
    act(() => void h.current.start('growth'));
    await act(async () => jest.advanceTimersByTimeAsync(130_000));
    expect(h.current.phase).toEqual({ kind: 'offline' });
  });
});
