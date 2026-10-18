import type {
  BillingUsageDTO,
  PlanDTO,
  PlanKey,
  PlansDTO,
} from '@booking/types';
import * as React from 'react';

import {
  act,
  mount,
  pressableByLabel,
  pressableByText,
  text,
} from '@/testing/render';

import { PlanScreen } from '../components/PlanScreen';

const mockStart = jest.fn();
let mockPhase: { kind: string } = { kind: 'idle' };
jest.mock('../useCheckout', () => ({
  useCheckout: () => ({
    phase: mockPhase,
    start: mockStart,
    checkAgain: jest.fn(),
    notPaid: jest.fn(),
    reset: jest.fn(),
  }),
}));
const mockManage = jest.fn();
jest.mock('../useBillingActions', () => ({
  useManageSubscription: () => ({ mutate: mockManage }),
}));
const mockKeep = jest.fn();
let mockScheduled: { plan: string; effective_at: string } | null = null;
jest.mock('../usePlanChange', () => ({
  useKeepPlan: () => ({ mutate: mockKeep, isPending: false }),
  useScheduledChange: () => mockScheduled,
}));
let mockSheetPlan: { id: string } | null = null;
jest.mock('../components/PlanChangeSheet', () => ({
  PlanChangeSheet: ({ plan }: { plan: { id: string } | null }) => {
    mockSheetPlan = plan;
    return null;
  },
}));
jest.mock('@/features/business/hooks', () => ({
  useBusiness: () => ({ data: { timezone: 'Africa/Johannesburg' } }),
}));
const mockBlocked = jest.fn();
jest.mock('@/lib/toast', () => ({
  ...jest.requireActual('@/lib/toast'),
  toast: { blocked: (...a: unknown[]) => mockBlocked(...a) },
}));
let mockCanManage = true;
jest.mock('@/features/business/me', () => ({
  useCanManage: () => mockCanManage,
}));

const mockUsePlans = jest.fn();
const mockUseUsage = jest.fn();
jest.mock('../hooks', () => ({
  usePlans: () => mockUsePlans(),
  useBillingUsage: () => mockUseUsage(),
}));

function plan(id: PlanKey, over: Partial<PlanDTO> = {}): PlanDTO {
  const paid = id !== 'free' && id !== 'none';
  const price = { none: 0, free: 0, starter: 20000, growth: 40000, pro: 80000 }[
    id
  ];
  const jobs = { none: null, free: null, starter: 50, growth: 100, pro: 200 }[
    id
  ];
  return {
    id,
    name: id[0].toUpperCase() + id.slice(1),
    price_cents: price,
    currency: 'ZAR',
    included_jobs: jobs,
    extra_job_cents: paid ? 400 : null,
    has_companion: paid,
    is_current: false,
    checkout_url: null,
    ...over,
  };
}

function plans(current: PlanKey, checkoutUrl: string | null = null): PlansDTO {
  return {
    current_plan: current,
    plans: (['free', 'starter', 'growth', 'pro'] as const).map((id) =>
      plan(id, { is_current: id === current, checkout_url: checkoutUrl }),
    ),
  };
}

function usage(over: Partial<BillingUsageDTO> = {}): BillingUsageDTO {
  return {
    plan: 'growth',
    month: '2026-10',
    completed_jobs: 63,
    included_jobs: 100,
    usage_percent: 63,
    usage_state: 'normal',
    extra_jobs: 0,
    extra_cost_cents: 0,
    resets_on: '2026-11-01',
    ...over,
  };
}

const query = (over: Record<string, unknown>) => ({
  data: undefined,
  isError: false,
  error: null,
  isPending: false,
  fetchStatus: 'idle',
  dataUpdatedAt: 1,
  refetch: jest.fn(),
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPhase = { kind: 'idle' };
  mockScheduled = null;
  mockSheetPlan = null;
  mockCanManage = true;
  mockUseUsage.mockReturnValue(query({ data: usage() }));
});

describe('PlanScreen', () => {
  it('never mentions Free, even when the catalogue still lists a free plan', () => {
    mockUsePlans.mockReturnValue(query({ data: plans('growth') }));
    const tree = mount(<PlanScreen />);
    expect(text(tree)).not.toMatch(/free/i);
    mockUsePlans.mockReturnValue(query({ data: plans('none') }));
    expect(text(mount(<PlanScreen />))).not.toMatch(/free/i);
  });

  it('shows the usage card, the three paid tiers and bookings wording', () => {
    mockUsePlans.mockReturnValue(query({ data: plans('growth') }));
    const tree = mount(<PlanScreen />);
    const out = text(tree);
    expect(out).toContain('Plan & billing');
    expect(out).toContain('63 of 100 bookings this month · resets 1 Nov');
    expect(out).toContain('50 bookings a month');
    expect(out).toContain('Extra bookings R4');
    expect(out).toContain('Current plan');
    expect(out).toContain('Choose Starter');
    expect(out).toContain('Choose Pro');
    expect(out).not.toContain('Choose Growth');
    expect(out).not.toContain('completed');
    expect(
      tree.root.findAll(
        (n) =>
          typeof n.type === 'string' &&
          n.props.accessibilityRole === 'progressbar',
      ),
    ).toHaveLength(1);
  });

  it('near and over show the amber warnings', () => {
    mockUsePlans.mockReturnValue(query({ data: plans('growth') }));
    mockUseUsage.mockReturnValue(
      query({
        data: usage({
          completed_jobs: 86,
          usage_percent: 86,
          usage_state: 'near',
        }),
      }),
    );
    expect(text(mount(<PlanScreen />))).toContain("You're close to your limit");

    mockUseUsage.mockReturnValue(
      query({
        data: usage({
          completed_jobs: 104,
          usage_percent: 104,
          usage_state: 'over',
          extra_jobs: 4,
          extra_cost_cents: 1600,
        }),
      }),
    );
    const out = text(mount(<PlanScreen />));
    expect(out).toContain("You're over your limit");
    expect(out).toContain('4 extra bookings, R16 so far');
  });

  it('a subscriber opens the confirmation sheet instead of changing at once', () => {
    mockUsePlans.mockReturnValue(query({ data: plans('growth') }));
    const tree = mount(<PlanScreen />);
    act(() => pressableByText(tree, 'Choose Pro').props.onPress());
    expect(mockSheetPlan?.id).toBe('pro');
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('shows a quiet banner for a booked downgrade, and Keep re-selects the current plan', () => {
    mockScheduled = { plan: 'starter', effective_at: '2026-11-18T08:00:00Z' };
    mockUsePlans.mockReturnValue(query({ data: plans('pro') }));
    const tree = mount(<PlanScreen />);
    expect(text(tree)).toContain('Switching to Starter on 18 Nov');
    act(() => pressableByText(tree, 'Keep Pro').props.onPress());
    expect(mockKeep).toHaveBeenCalledWith('pro');
  });

  it('a business with no plan starts checkout for the chosen plan', () => {
    mockUsePlans.mockReturnValue(query({ data: plans('none') }));
    mockUseUsage.mockReturnValue(query({ data: undefined }));
    const tree = mount(<PlanScreen />);
    act(() => pressableByText(tree, 'Choose Pro').props.onPress());
    expect(mockStart).toHaveBeenCalledWith('pro');
    expect(mockSheetPlan).toBeNull();
  });

  it('tells staff that choosing a plan is for the owner', () => {
    mockCanManage = false;
    mockUsePlans.mockReturnValue(query({ data: plans('growth') }));
    const tree = mount(<PlanScreen />);
    act(() => pressableByText(tree, 'Choose Pro').props.onPress());
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockBlocked).toHaveBeenCalled();
  });

  it('shows what is happening while checkout is open, with a way on', () => {
    mockPhase = { kind: 'not_configured' };
    mockUsePlans.mockReturnValue(query({ data: plans('growth') }));
    const out = text(mount(<PlanScreen />));
    expect(out).toContain("Payments aren't switched on yet");
    expect(out).toContain('Try again');
  });

  it('Manage subscription opens the portal for an owner with a plan, and is dimmed with a reason otherwise', () => {
    mockUsePlans.mockReturnValue(query({ data: plans('growth') }));
    const tree = mount(<PlanScreen />);
    act(() => pressableByLabel(tree, 'Manage subscription').props.onPress());
    expect(mockManage).toHaveBeenCalled();

    mockUsePlans.mockReturnValue(query({ data: plans('none') }));
    const none = mount(<PlanScreen />);
    expect(text(none)).toContain('No subscription to manage yet');
    expect(
      none.root.findAll(
        (n) =>
          typeof n.props.accessibilityLabel === 'string' &&
          n.props.accessibilityLabel.startsWith('Manage subscription') &&
          n.props.accessibilityState?.disabled === true,
      ).length,
    ).toBeGreaterThan(0);
  });

  it('opens the comparison table from the disclosure, without Free-era rows', () => {
    mockUsePlans.mockReturnValue(query({ data: plans('growth') }));
    const tree = mount(<PlanScreen />);
    act(() => pressableByText(tree, 'Compare plans').props.onPress());
    const out = text(tree);
    expect(out).toContain('AI companion');
    expect(out).toContain('R800');
    expect(out).not.toContain('Team inbox');
    expect(out).not.toContain('Manual booking');
  });

  it('shows a skeleton, then an error with retry', () => {
    mockUsePlans.mockReturnValue(query({ isPending: true, dataUpdatedAt: 0 }));
    const loading = mount(<PlanScreen />);
    expect(
      loading.root.findAll(
        (n) => n.props.accessibilityLabel === 'Loading plans',
      ).length,
    ).toBeGreaterThan(0);

    const refetch = jest.fn();
    mockUsePlans.mockReturnValue(
      query({
        isError: true,
        error: new Error('x'),
        dataUpdatedAt: 0,
        refetch,
      }),
    );
    const failed = mount(<PlanScreen />);
    expect(text(failed)).toContain("Couldn't load your plan");
    act(() => pressableByText(failed, 'Try again').props.onPress());
    expect(refetch).toHaveBeenCalled();
  });
});
