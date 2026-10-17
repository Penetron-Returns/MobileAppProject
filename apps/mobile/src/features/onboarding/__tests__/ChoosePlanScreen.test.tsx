import type { PlanDTO } from '@booking/types';
import * as React from 'react';

import {
  act,
  mount,
  pressableByLabel,
  pressableByText,
  text,
} from '@/testing/render';

import { ChoosePlanScreen } from '../components/ChoosePlanScreen';

const mockStart = jest.fn();
const mockReset = jest.fn();
const mockNotPaid = jest.fn();
const mockCheckAgain = jest.fn();
let mockPhase: { kind: string } = { kind: 'idle' };
jest.mock('@/features/plans/useCheckout', () => ({
  useCheckout: () => ({
    phase: mockPhase,
    start: mockStart,
    reset: mockReset,
    notPaid: mockNotPaid,
    checkAgain: mockCheckAgain,
  }),
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

beforeEach(() => {
  jest.clearAllMocks();
  mockPhase = { kind: 'idle' };
  mockPlans = LOADED;
});

describe('ChoosePlanScreen', () => {
  it('shows three paid plans with price, allowance and extra-booking price, and never Free', () => {
    const out = text(mount(<ChoosePlanScreen />));
    expect(out).toContain('Choose a plan');
    for (const name of ['Starter', 'Growth', 'Pro'])
      expect(out).toContain(name);
    expect(out).toContain('R200 a month');
    expect(out).toContain('R400 a month');
    expect(out).toContain('R800 a month');
    expect(out).toContain('50 bookings a month');
    expect(out).toContain('100 bookings a month');
    expect(out).toContain('200 bookings a month');
    expect(out).toContain('Extra bookings R4');
    expect(out).not.toMatch(/\bfree\b/i);
    expect(out).not.toMatch(/trial/i);
  });

  it('has a speaker button that reads the plans aloud', () => {
    const tree = mount(<ChoosePlanScreen />);
    expect(
      tree.root.findAll(
        (n) => n.props.accessibilityLabel === 'Read aloud' && !!n.props.onPress,
      ).length,
    ).toBeGreaterThan(0);
  });

  it('Start begins checkout for that plan', () => {
    const tree = mount(<ChoosePlanScreen />);
    act(() =>
      pressableByLabel(tree, 'Start Growth, R400 a month').props.onPress(),
    );
    expect(mockStart).toHaveBeenCalledWith('growth');
  });

  it('shows a skeleton while the plans load, and an error with retry when they fail', () => {
    mockPlans = { data: undefined, isError: false, refetch: jest.fn() };
    const loading = mount(<ChoosePlanScreen />);
    expect(
      loading.root.findAll(
        (n) => n.props.accessibilityLabel === 'Loading plans',
      ).length,
    ).toBeGreaterThan(0);

    const refetch = jest.fn();
    mockPlans = {
      data: undefined,
      isError: true,
      error: new Error('x'),
      refetch,
    };
    const failed = mount(<ChoosePlanScreen />);
    expect(text(failed)).toContain("Couldn't load the plans");
    act(() => pressableByText(failed, 'Try again').props.onPress());
    expect(refetch).toHaveBeenCalled();
  });

  it.each([
    ['starting', 'Opening checkout'],
    ['browser', 'Opening checkout'],
    ['confirming', 'Confirming your payment'],
    ['cancelled', 'Payment cancelled'],
    ['unconfirmed', 'Still confirming your payment'],
    ['failed', "Checkout didn't open"],
    ['offline', "You're offline"],
    ['not_configured', "Payments aren't switched on yet"],
  ])('says "%s" plainly: %s', (kind, title) => {
    mockPhase = { kind };
    const out = text(mount(<ChoosePlanScreen />));
    expect(out).toContain(title);
    expect(out).not.toContain('Extra bookings R4');
  });

  it('never leaves a dead end: every problem has a retry and a way back to the plans', () => {
    for (const kind of [
      'cancelled',
      'unconfirmed',
      'failed',
      'offline',
      'not_configured',
    ]) {
      mockPhase = { kind };
      const tree = mount(<ChoosePlanScreen />);
      const retry = kind === 'unconfirmed' ? 'Check again' : 'Try again';
      expect(pressableByLabel(tree, retry)).toBeDefined();
      act(() => pressableByLabel(tree, 'Back to plans').props.onPress());
      expect(mockReset).toHaveBeenCalled();
      mockReset.mockClear();
    }
  });

  it('wires Check again', () => {
    mockPhase = { kind: 'unconfirmed' };
    const tree = mount(<ChoosePlanScreen />);
    act(() => pressableByLabel(tree, 'Check again').props.onPress());
    expect(mockCheckAgain).toHaveBeenCalled();
  });

  it("wires I didn't pay", () => {
    mockPhase = { kind: 'confirming' };
    const tree = mount(<ChoosePlanScreen />);
    act(() => pressableByLabel(tree, "I didn't pay").props.onPress());
    expect(mockNotPaid).toHaveBeenCalled();
  });
});
