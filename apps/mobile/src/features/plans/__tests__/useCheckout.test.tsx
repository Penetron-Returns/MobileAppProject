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
  openAuthSessionAsync: (...a: unknown[]) => mockOpen(...a),
}));
jest.mock('expo-linking', () => ({
  createURL: (path: string) => `clovie://${path}`,
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
const SUCCESS = { type: 'success', url: 'clovie://checkout/success' };

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockCreate.mockResolvedValue({
    checkout_url: 'https://pay.example/c/1',
    session_id: 'cs_1',
  });
  mockOpen.mockResolvedValue({ type: 'dismiss' });
});
afterEach(() => jest.useRealTimers());

const run = (h: { current: Checkout }, plan: 'starter' | 'growth' | 'pro') =>
  act(async () => {
    const started = h.current.start(plan);
    await jest.advanceTimersByTimeAsync(5000);
    await started;
  });

const settle = () => act(async () => jest.advanceTimersByTimeAsync(0));

describe('useCheckout', () => {
  it('asks for a session with a return_url and an Idempotency-Key, and opens it as an auth session', async () => {
    mockOpen.mockResolvedValue(SUCCESS);
    mockMe.mockResolvedValue(GROWTH);
    const h = harness();
    await run(h, 'growth');
    expect(mockCreate).toHaveBeenCalledWith(
      { plan: 'growth', return_url: 'clovie://checkout/success' },
      'key-1',
    );
    expect(mockOpen).toHaveBeenCalledWith(
      'https://pay.example/c/1',
      'clovie://checkout',
    );
  });

  it('is active straight away on success, without ever showing Confirming', async () => {
    mockOpen.mockResolvedValue(SUCCESS);
    mockMe.mockResolvedValue(GROWTH);
    const onReturned = jest.fn();
    const onActivated = jest.fn();
    const h = harness({ onReturned, onActivated });
    const phases: string[] = [];
    await act(async () => {
      const started = h.current.start('growth');
      await jest.advanceTimersByTimeAsync(0);
      phases.push(h.current.phase.kind);
      await started;
    });
    expect(phases).not.toContain('confirming');
    expect(mockMe).toHaveBeenCalledTimes(1);
    expect(h.current.phase).toEqual({ kind: 'active' });
    expect(onReturned).toHaveBeenCalledWith('success', 'growth');
    expect(onActivated).toHaveBeenCalledWith('growth');
  });

  it('polls fast when the flip is slow, and does not show Confirming under 800ms', async () => {
    mockOpen.mockResolvedValue(SUCCESS);
    mockMe
      .mockResolvedValueOnce(NONE)
      .mockResolvedValueOnce(NONE)
      .mockResolvedValue(GROWTH);
    const h = harness();
    act(() => void h.current.start('growth'));
    await settle();
    expect(h.current.phase.kind).toBe('browser');
    await act(async () => jest.advanceTimersByTimeAsync(400));
    expect(mockMe).toHaveBeenCalledTimes(2);
    expect(h.current.phase.kind).toBe('browser');
    await act(async () => jest.advanceTimersByTimeAsync(400));
    expect(mockMe).toHaveBeenCalledTimes(3);
    expect(h.current.phase.kind).toBe('active');
  });

  it('shows Confirming when the flip takes longer than 800ms', async () => {
    mockOpen.mockResolvedValue(SUCCESS);
    mockMe.mockResolvedValue(NONE);
    const h = harness();
    act(() => void h.current.start('growth'));
    await act(async () => jest.advanceTimersByTimeAsync(900));
    expect(h.current.phase.kind).toBe('confirming');
  });

  it('goes straight back to the plans on cancel, with one background refetch', async () => {
    mockOpen.mockResolvedValue({ type: 'cancel' });
    mockMe.mockResolvedValue(NONE);
    const onReturned = jest.fn();
    const onActivated = jest.fn();
    const h = harness({ onReturned, onActivated });
    await run(h, 'growth');
    expect(h.current.phase).toEqual({ kind: 'idle' });
    expect(mockMe).toHaveBeenCalledTimes(1);
    expect(onReturned).toHaveBeenCalledWith('cancel', 'growth');
    expect(onActivated).not.toHaveBeenCalled();
  });

  it('notices a payment made before the tab was closed early', async () => {
    mockOpen.mockResolvedValue({ type: 'dismiss' });
    mockMe.mockResolvedValue(GROWTH);
    const onActivated = jest.fn();
    const h = harness({ onActivated });
    await run(h, 'growth');
    expect(onActivated).toHaveBeenCalledWith('growth');
  });

  it('refetches me on ALREADY_SUBSCRIBED and shows no error', async () => {
    mockCreate.mockRejectedValue(
      new ApiError({
        code: 'RULE_VIOLATION',
        message: 'x',
        status: 422,
        details: { rule: 'ALREADY_SUBSCRIBED' },
      }),
    );
    mockMe.mockResolvedValue(GROWTH);
    const onActivated = jest.fn();
    const h = harness({ onActivated });
    await run(h, 'growth');
    expect(mockMe).toHaveBeenCalled();
    expect(mockOpen).not.toHaveBeenCalled();
    expect(h.current.phase).toEqual({ kind: 'idle' });
    expect(onActivated).toHaveBeenCalled();
  });

  it('ignores a second tap while an attempt is running', async () => {
    mockOpen.mockReturnValue(new Promise(() => undefined));
    const h = harness();
    act(() => {
      void h.current.start('growth');
      void h.current.start('growth');
    });
    await settle();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('never lets a stale attempt overwrite a newer one', async () => {
    mockOpen.mockResolvedValue(SUCCESS);
    mockMe.mockResolvedValue(NONE);
    const h = harness();
    act(() => void h.current.start('growth'));
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    expect(h.current.phase.kind).toBe('confirming');
    act(() => h.current.reset());
    expect(h.current.phase).toEqual({ kind: 'idle' });
    // The old poll keeps waking up but can no longer change the screen.
    await act(async () => jest.advanceTimersByTimeAsync(130_000));
    expect(h.current.phase).toEqual({ kind: 'idle' });
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

  it('lets the owner stop waiting on the slow path', async () => {
    mockOpen.mockResolvedValue(SUCCESS);
    mockMe.mockResolvedValue(NONE);
    const h = harness();
    act(() => void h.current.start('growth'));
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    expect(h.current.phase.kind).toBe('confirming');
    act(() => h.current.notPaid());
    expect(h.current.phase).toEqual({ kind: 'cancelled' });
    await act(async () => jest.advanceTimersByTimeAsync(30_000));
    expect(h.current.phase).toEqual({ kind: 'cancelled' });
  });

  it('ends in "still confirming" when the plan never flips, then confirms on Check again', async () => {
    mockOpen.mockResolvedValue(SUCCESS);
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
    mockOpen.mockResolvedValue(SUCCESS);
    mockMe.mockRejectedValue(
      new ApiError({ code: 'NETWORK_ERROR', message: 'x', status: 0 }),
    );
    const h = harness();
    act(() => void h.current.start('growth'));
    await act(async () => jest.advanceTimersByTimeAsync(130_000));
    expect(h.current.phase).toEqual({ kind: 'offline' });
  });
});
