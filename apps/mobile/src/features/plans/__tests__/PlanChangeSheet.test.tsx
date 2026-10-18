import type {
  ChangePlanResultDTO,
  PlanChangePreviewDTO,
  PlanDTO,
} from '@booking/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

import { ApiError } from '@/lib/api';
import { qk } from '@/lib/query';
import { act, mount, pressableByText, text } from '@/testing/render';

import { PlanChangeSheet } from '../components/PlanChangeSheet';
import { useKeepPlan } from '../usePlanChange';

jest.mock('@booking/ui/components/Sheet', () => {
  const { View } = require('react-native');
  const Passthrough = ({ children }: { children?: unknown }) =>
    children ?? null;
  return {
    Sheet: ({ open, children }: { open: boolean; children?: unknown }) =>
      open ? children : null,
    SheetContent: Passthrough,
    SheetHeader: View,
    SheetTitle: Passthrough,
    SheetDescription: Passthrough,
  };
});
jest.mock('expo-crypto', () => ({ randomUUID: () => 'key-1' }));
jest.mock('expo-linking', () => ({
  createURL: (path: string) => `clovie://${path}`,
}));
const mockOpen = jest.fn();
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...a: unknown[]) => mockOpen(...a),
}));
jest.mock('@/features/business/hooks', () => ({
  useBusiness: () => ({ data: { timezone: 'Africa/Johannesburg' } }),
}));
const mockManage = jest.fn();
jest.mock('../useBillingActions', () => ({
  useManageSubscription: () => ({ mutate: mockManage }),
}));

const mockPreview = jest.fn();
const mockChange = jest.fn();
const mockMe = jest.fn();
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  api: {
    previewPlanChange: (...a: unknown[]) => mockPreview(...a),
    changePlan: (...a: unknown[]) => mockChange(...a),
    me: () => mockMe(),
  },
}));

const PRO = { id: 'pro', name: 'Pro' } as PlanDTO;
const STARTER = { id: 'starter', name: 'Starter' } as PlanDTO;

const UPGRADE: PlanChangePreviewDTO = {
  direction: 'upgrade',
  plan: 'pro',
  current_plan: 'growth',
  amount_due_now_cents: 59900,
  currency: 'ZAR',
  next_amount_cents: 80000,
  effective_at: '2026-10-18T10:00:00Z',
  next_billing_at: '2026-11-18T08:00:00Z',
  proration_date: 1760000000,
};
const DOWNGRADE: PlanChangePreviewDTO = {
  direction: 'downgrade',
  plan: 'starter',
  current_plan: 'pro',
  amount_due_now_cents: 0,
  currency: 'ZAR',
  next_amount_cents: 20000,
  effective_at: '2026-11-18T08:00:00Z',
  next_billing_at: '2026-11-18T08:00:00Z',
  proration_date: null,
};

let client: QueryClient;
let invalidate: jest.SpyInstance;
const onClose = jest.fn();

function open(plan: PlanDTO, currentName: string) {
  return mount(
    <QueryClientProvider client={client}>
      <PlanChangeSheet
        plan={plan}
        currentName={currentName}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { gcTime: 0 } },
  });
  invalidate = jest.spyOn(client, 'invalidateQueries');
  mockMe.mockResolvedValue({ plan: 'pro', features: [] });
  mockOpen.mockResolvedValue({ type: 'dismiss' });
});
afterEach(() => client.clear());

async function confirm(tree: ReturnType<typeof open>, label: string) {
  await act(async () => {
    pressableByText(tree, label).props.onPress();
  });
  await flush();
}

describe('PlanChangeSheet', () => {
  it('shows a skeleton while loading, then the upgrade amounts', async () => {
    let resolve!: (v: PlanChangePreviewDTO) => void;
    mockPreview.mockReturnValue(new Promise((r) => (resolve = r)));
    const tree = open(PRO, 'Growth');
    expect(
      tree.root.findAll(
        (n) => n.props.accessibilityLabel === 'Loading the cost of this change',
      ).length,
    ).toBeGreaterThan(0);
    await act(async () => resolve(UPGRADE));
    await flush();
    const out = text(tree);
    expect(mockPreview).toHaveBeenCalledWith('pro');
    expect(out).toContain('Upgrade to Pro');
    expect(out).toContain(
      'R599 today for the rest of this month, then R800 a month from 18 Nov.',
    );
    expect(out).toContain('Pay R599 and upgrade');
    expect(out).toContain('Not now');
  });

  it('confirming an active upgrade invalidates the plan queries and closes the sheet', async () => {
    mockPreview.mockResolvedValue(UPGRADE);
    mockChange.mockResolvedValue({
      status: 'active',
      plan: 'pro',
    } satisfies ChangePlanResultDTO);
    const tree = open(PRO, 'Growth');
    await flush();
    await confirm(tree, 'Pay R599 and upgrade');
    expect(mockChange).toHaveBeenCalledWith(
      { plan: 'pro', proration_date: 1760000000 },
      'key-1',
    );
    const keys = invalidate.mock.calls.map((c) => c[0].queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([qk.me, qk.plans, ['billing-usage']]),
    );
    expect(text(tree)).toContain('Plan updated');
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });
    expect(onClose).toHaveBeenCalled();
  }, 10_000);

  it('ignores a second tap while the change is in flight', async () => {
    mockPreview.mockResolvedValue(UPGRADE);
    mockChange.mockReturnValue(new Promise(() => undefined));
    const tree = open(PRO, 'Growth');
    await flush();
    await confirm(tree, 'Pay R599 and upgrade');
    await confirm(tree, 'Pay R599 and upgrade');
    expect(mockChange).toHaveBeenCalledTimes(1);
  });

  it('opens the hosted invoice in an auth session when payment needs action', async () => {
    mockPreview.mockResolvedValue(UPGRADE);
    mockChange.mockResolvedValue({
      status: 'requires_action',
      plan: 'pro',
      hosted_invoice_url: 'https://pay.example/i/1',
    });
    const tree = open(PRO, 'Growth');
    await flush();
    await confirm(tree, 'Pay R599 and upgrade');
    expect(mockOpen).toHaveBeenCalledWith(
      'https://pay.example/i/1',
      'clovie://checkout',
    );
    expect(mockMe).toHaveBeenCalled();
  });

  it('a declined card shows the inline error and Update card', async () => {
    mockPreview.mockResolvedValue(UPGRADE);
    mockChange.mockRejectedValue(
      new ApiError({
        code: 'PAYMENT_FAILED' as never,
        message: 'declined',
        status: 402,
      }),
    );
    const tree = open(PRO, 'Growth');
    await flush();
    await confirm(tree, 'Pay R599 and upgrade');
    expect(text(tree)).toContain(
      'Your card was declined. Your plan has not changed.',
    );
    expect(onClose).not.toHaveBeenCalled();
    act(() => pressableByText(tree, 'Update card').props.onPress());
    expect(mockManage).toHaveBeenCalled();
  });

  it('a downgrade says when it switches and closes once scheduled', async () => {
    mockPreview.mockResolvedValue(DOWNGRADE);
    mockChange.mockResolvedValue({
      status: 'scheduled',
      plan: 'starter',
      effective_at: DOWNGRADE.effective_at,
    });
    const tree = open(STARTER, 'Pro');
    await flush();
    const out = text(tree);
    expect(out).toContain('Switch to Starter on 18 Nov');
    expect(out).toContain('You keep Pro until then. No refund for this month.');
    await confirm(tree, 'Switch on 18 Nov');
    expect(client.getQueryData(qk.planScheduled)).toEqual({
      plan: 'starter',
      effective_at: DOWNGRADE.effective_at,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes without asking when the preview says it is the same plan', async () => {
    mockPreview.mockResolvedValue({ ...UPGRADE, direction: 'same' });
    const tree = open(PRO, 'Pro');
    await flush();
    expect(onClose).toHaveBeenCalled();
    expect(mockChange).not.toHaveBeenCalled();
    expect(text(tree)).not.toContain('Upgrade to');
  });
});

describe('useKeepPlan', () => {
  it('re-selects the current plan and clears the booked downgrade', async () => {
    mockChange.mockResolvedValue({ status: 'active', plan: 'pro' });
    const ref: { current: ReturnType<typeof useKeepPlan> | null } = {
      current: null,
    };
    function Probe() {
      ref.current = useKeepPlan();
      return null;
    }
    client.setQueryData(qk.planScheduled, {
      plan: 'starter',
      effective_at: '2026-11-18T08:00:00Z',
    });
    mount(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
    await act(async () => {
      ref.current?.mutate('pro');
    });
    await flush();
    expect(mockChange).toHaveBeenCalledWith({ plan: 'pro' }, 'key-1');
    expect(client.getQueryData(qk.planScheduled)).toBeNull();
  });
});

/** React Query batches notifications on a timer, so let one real tick pass. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
