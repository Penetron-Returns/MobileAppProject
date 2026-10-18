import type { PlanDTO } from '@booking/types';
import * as React from 'react';

import { setAnalytics } from '@/features/analytics';
import {
  createFakeAnalytics,
  type FakeAnalytics,
} from '@/features/analytics/testing';
import { act, mount, pressableByLabel, text } from '@/testing/render';

import { ChoosePlanScreen } from '../components/ChoosePlanScreen';

jest.mock('@clerk/expo', () => ({ useAuth: () => ({ isSignedIn: true }) }));
jest.mock('@/features/auth/useSignOut', () => ({
  useSignOut: () => jest.fn(),
}));

jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('@/features/brand/ClovieAnimated', () => ({
  ClovieAnimated: () => null,
}));

const mockStart = jest.fn();
const mockReset = jest.fn();
const mockNotPaid = jest.fn();
const mockCheckAgain = jest.fn();
let mockPhase: { kind: string } = { kind: 'idle' };
let mockOptions: { onReturned?: (o: string, p: string | null) => void } = {};
jest.mock('@/features/plans/useCheckout', () => ({
  useCheckout: (options: typeof mockOptions) => {
    mockOptions = options;
    return {
      phase: mockPhase,
      start: mockStart,
      reset: mockReset,
      notPaid: mockNotPaid,
      checkAgain: mockCheckAgain,
    };
  },
}));

let mockPlans: Record<string, unknown> = {};
jest.mock('@/features/plans/hooks', () => ({
  usePlans: () => mockPlans,
}));

const plan = (
  id: PlanDTO['id'],
  price: number,
  jobs: number | null,
): PlanDTO => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  price_cents: price,
  currency: 'ZAR',
  included_jobs: jobs,
  extra_job_cents: jobs ? 400 : null,
  has_companion: jobs !== null,
  is_current: false,
  checkout_url: null,
});

const LOADED = {
  data: {
    current_plan: 'none',
    plans: [
      plan('free', 0, null),
      plan('starter', 20000, 50),
      plan('growth', 40000, 100),
      plan('pro', 80000, 200),
    ],
  },
  isError: false,
  error: null,
  refetch: jest.fn(),
};

let fake: FakeAnalytics;
beforeEach(() => {
  jest.clearAllMocks();
  mockPhase = { kind: 'idle' };
  mockPlans = LOADED;
  fake = createFakeAnalytics();
  setAnalytics(fake);
});
afterEach(() => setAnalytics());

describe('ChoosePlanScreen', () => {
  it('shows the three paid plans with prices and allowances, and no free option', () => {
    const tree = mount(<ChoosePlanScreen />);
    const out = text(tree);
    expect(out).toContain('Last step.');
    expect(out).toContain('Pick your plan.');
    for (const piece of [
      'Starter',
      'Growth',
      'Pro',
      'R200',
      'R400',
      'R800',
      '50 bookings a month',
      '100 bookings a month',
      '200 bookings a month',
      'Extra bookings are R4 each.',
      'Cancel anytime.',
    ]) {
      expect(out).toContain(piece);
    }
    expect(out).not.toMatch(/\bFree\b/);
  });

  it('selects Starter first, and the button names whichever plan is chosen', () => {
    const tree = mount(<ChoosePlanScreen />);
    const radio = (name: string) =>
      tree.root.find(
        (n) =>
          n.props.accessibilityRole === 'radio' &&
          String(n.props.accessibilityLabel).startsWith(name) &&
          !!n.props.onPress,
      );
    expect(radio('Starter').props.accessibilityState.checked).toBe(true);
    expect(text(tree)).toContain('Continue with Starter');
    act(() => radio('Pro').props.onPress());
    expect(radio('Pro').props.accessibilityState.checked).toBe(true);
    expect(radio('Starter').props.accessibilityState.checked).toBe(false);
    expect(text(tree)).toContain('Continue with Pro');
  });

  it('reports the plan viewed, and the checkout started with only the plan id', () => {
    const tree = mount(<ChoosePlanScreen />);
    act(() => pressableByLabel(tree, 'Continue with Starter').props.onPress());
    expect(mockStart).toHaveBeenCalledWith('starter');
    expect(fake.events).toEqual([
      { event: 'plan_viewed', props: {} },
      { event: 'checkout_started', props: { plan: 'starter' } },
    ]);
  });

  it('reports how checkout ended, and the plan once it is active', () => {
    mount(<ChoosePlanScreen />);
    act(() => mockOptions.onReturned?.('timeout', 'growth'));
    act(() => mockOptions.onReturned?.('active', 'growth'));
    expect(fake.events.slice(1)).toEqual([
      { event: 'checkout_returned', props: { outcome: 'timeout' } },
      { event: 'checkout_returned', props: { outcome: 'active' } },
      { event: 'plan_activated', props: { plan: 'growth' } },
    ]);
  });

  it('waits on the confirming screen and lets the owner say they did not pay', () => {
    mockPhase = { kind: 'confirming' };
    const tree = mount(<ChoosePlanScreen />);
    expect(text(tree)).toContain('Confirming your payment...');
    act(() => pressableByLabel(tree, "I didn't pay").props.onPress());
    expect(mockNotPaid).toHaveBeenCalled();
  });

  it('shows the calm failure screen, and Try again restarts the same plan', () => {
    mockPhase = { kind: 'failed' };
    const tree = mount(<ChoosePlanScreen />);
    expect(text(tree)).toContain("That didn't go through.");
    act(() => pressableByLabel(tree, 'Try again').props.onPress());
    expect(mockStart).toHaveBeenCalledWith('starter');
    act(() => pressableByLabel(tree, 'Pick another plan').props.onPress());
    expect(mockReset).toHaveBeenCalled();
  });

  it('explains a plan list that did not load, with a retry', () => {
    mockPlans = {
      data: undefined,
      isError: true,
      error: new Error('boom'),
      refetch: jest.fn(),
    };
    const tree = mount(<ChoosePlanScreen />);
    expect(text(tree)).toContain("Couldn't load the plans");
  });
});

describe('ChoosePlanScreen Back', () => {
  it('has no Back unless the app gives one, and then calls it', () => {
    const none = mount(<ChoosePlanScreen />);
    expect(() => pressableByLabel(none, 'Back')).toThrow();
    const onBack = jest.fn();
    const tree = mount(<ChoosePlanScreen onBack={onBack} />);
    act(() => pressableByLabel(tree, 'Back').props.onPress());
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('Back from the payment wait and from a failed payment returns to the plans', () => {
    for (const kind of ['confirming', 'cancelled']) {
      mockPhase = { kind };
      const tree = mount(<ChoosePlanScreen />);
      act(() => pressableByLabel(tree, 'Back').props.onPress());
    }
    expect(mockNotPaid).toHaveBeenCalledTimes(1);
    expect(mockReset).toHaveBeenCalledTimes(1);
  });
});
