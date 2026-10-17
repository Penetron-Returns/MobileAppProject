import type {
  BillingUsageDTO,
  PlanDTO,
  PlanKey,
  PlansDTO,
} from '@booking/types';
import * as React from 'react';

import { act, mount, pressableByText, text } from '@/testing/render';

import { PlanScreen } from '../components/PlanScreen';

const mockInfo = jest.fn();
jest.mock('@/lib/toast', () => ({
  ...jest.requireActual('@/lib/toast'),
  toast: { info: (...a: unknown[]) => mockInfo(...a) },
}));
const mockOpenBrowser = jest.fn();
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...a: unknown[]) => mockOpenBrowser(...a),
}));

const mockUsePlans = jest.fn();
const mockUseUsage = jest.fn();
jest.mock('../hooks', () => ({
  usePlans: () => mockUsePlans(),
  useBillingUsage: () => mockUseUsage(),
}));

function plan(id: PlanKey, over: Partial<PlanDTO> = {}): PlanDTO {
  const paid = id !== 'free';
  const price = { free: 0, starter: 20000, growth: 40000, pro: 80000 }[id];
  const jobs = { free: null, starter: 50, growth: 100, pro: 200 }[id];
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
  mockUseUsage.mockReturnValue(query({ data: usage() }));
});

describe('PlanScreen', () => {
  it('Free: the Free card, three equal tiers and no usage bar', () => {
    mockUsePlans.mockReturnValue(query({ data: plans('free') }));
    mockUseUsage.mockReturnValue(
      query({
        data: usage({
          plan: 'free',
          included_jobs: null,
          usage_percent: null,
        }),
      }),
    );
    const tree = mount(<PlanScreen />);
    const out = text(tree);
    expect(out).toContain('Plan & billing');
    expect(out).toContain('R4 per completed job. Pick the size that fits.');
    expect(out).toContain("You're on Free. Add your AI companion from R200.");
    for (const tier of ['Starter', 'Growth', 'Pro']) {
      expect(out).toContain(`Choose ${tier}`);
    }
    expect(out).toContain('R200');
    expect(out).toContain('50 completed jobs');
    expect(out).toContain('R4 per job');
    expect(out).toContain('Every paid plan includes your AI companion');
    expect(out).not.toContain('Current plan');
    expect(
      tree.root.findAll((n) => n.props.accessibilityRole === 'progressbar'),
    ).toHaveLength(0);
  });

  it('paid: the usage card, and the current tier is not a button', () => {
    mockUsePlans.mockReturnValue(query({ data: plans('growth') }));
    const tree = mount(<PlanScreen />);
    const out = text(tree);
    expect(out).toContain('63 of 100 jobs this month · resets 1 Nov');
    expect(out).toContain('Current plan');
    expect(out).toContain('Choose Starter');
    expect(out).toContain('Choose Pro');
    expect(out).not.toContain('Choose Growth');
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
    expect(out).toContain('4 extra jobs, R16 so far');
  });

  it('tells the owner checkout is coming while there is no checkout URL', () => {
    mockUsePlans.mockReturnValue(query({ data: plans('free') }));
    const tree = mount(<PlanScreen />);
    act(() => pressableByText(tree, 'Choose Growth').props.onPress());
    expect(mockInfo).toHaveBeenCalledWith('Checkout opens soon');
    expect(mockOpenBrowser).not.toHaveBeenCalled();
  });

  it('opens the checkout URL once the API has one', () => {
    mockUsePlans.mockReturnValue(
      query({ data: plans('free', 'https://pay.example/checkout') }),
    );
    const tree = mount(<PlanScreen />);
    act(() => pressableByText(tree, 'Choose Pro').props.onPress());
    expect(mockOpenBrowser).toHaveBeenCalledWith(
      'https://pay.example/checkout',
    );
    expect(mockInfo).not.toHaveBeenCalled();
  });

  it('always lists Manage subscription, dimmed with its reason until a URL exists', () => {
    mockUsePlans.mockReturnValue(query({ data: plans('growth') }));
    const tree = mount(<PlanScreen />);
    const out = text(tree);
    expect(out).toContain('Managed on web');
    expect(out).toContain('Manage subscription');
    expect(out).toContain('Managed on the web');
    expect(
      tree.root.findAll(
        (n) =>
          typeof n.props.accessibilityLabel === 'string' &&
          n.props.accessibilityLabel.startsWith('Manage subscription') &&
          n.props.accessibilityState?.disabled === true,
      ).length,
    ).toBeGreaterThan(0);
  });

  it('opens the comparison table from the disclosure', () => {
    mockUsePlans.mockReturnValue(query({ data: plans('free') }));
    const tree = mount(<PlanScreen />);
    expect(text(tree)).not.toContain('Team inbox');
    act(() => pressableByText(tree, 'Compare plans').props.onPress());
    const out = text(tree);
    expect(out).toContain('Team inbox');
    expect(out).toContain('AI companion');
    expect(out).toContain('R800');
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
