import type { ReportsSummaryDTO } from '@booking/types';
import * as React from 'react';

import { act, mount, pressableByText, text } from '@/testing/render';

import { ReportsScreen } from '../components/ReportsScreen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a) },
}));
jest.mock('@/features/business/hooks', () => ({
  useBusiness: () => ({
    data: { id: 'b1', timezone: 'Africa/Johannesburg', currency: 'ZAR' },
    isPending: false,
    isError: false,
    fetchStatus: 'idle',
    error: null,
  }),
}));
jest.mock('@/features/business/me', () => ({ useCanManage: () => true }));

const mockUseReport = jest.fn();
jest.mock('../hooks', () => ({
  useReportsSummary: (month: string) => mockUseReport(month),
}));

function report(over: Partial<ReportsSummaryDTO> = {}): ReportsSummaryDTO {
  return {
    month: '2026-10',
    currency: 'ZAR',
    completed_jobs: 63,
    revenue_cents: 8_642_000,
    bookings_created: { whatsapp: 10, companion: 30, manual: 5, web: 5 },
    no_shows: 2,
    cancellations: 4,
    busiest: { weekday: 6, hour: 10 },
    weekly: [
      { week_start: '2026-10-05', completed_jobs: 30 },
      { week_start: '2026-10-12', completed_jobs: 33 },
    ],
    companion: {
      bookings_created: 41,
      bookings_rescheduled: 7,
      bookings_cancelled: 3,
      conversations_handled: 120,
    },
    usage: {
      plan: 'growth',
      month: '2026-10',
      completed_jobs: 63,
      included_jobs: 100,
      usage_percent: 63,
      usage_state: 'normal',
      extra_jobs: 0,
      extra_cost_cents: 0,
      resets_on: '2026-11-01',
    },
    ...over,
  };
}

const query = (over: Record<string, unknown>) => ({
  data: undefined,
  isError: false,
  error: null,
  isPending: false,
  fetchStatus: 'idle',
  dataUpdatedAt: 0,
  refetch: jest.fn(),
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-14T08:00:00Z'));
});
afterEach(() => jest.useRealTimers());

describe('ReportsScreen', () => {
  it('shows the full report', () => {
    mockUseReport.mockReturnValue(query({ data: report() }));
    const out = text(mount(<ReportsScreen />));
    expect(out).toContain('Reports');
    expect(out).toContain('October 2026');
    expect(out).toContain('Revenue · October 2026');
    expect(out).toContain('R 86,420');
    expect(out).toContain('63 completed jobs');
    expect(out).toContain('What your companion did');
    expect(out).toContain('Bookings made');
    expect(out).toContain('41');
    expect(out).toContain('120');
    expect(out).toContain('Where bookings come from');
    expect(out).toContain('Companion');
    expect(out).toContain('60%');
    expect(out).toContain('No-shows');
    expect(out).toContain('Busiest: Saturday around 10:00');
    expect(out).toContain('63 of 100 jobs this month · resets 1 Nov');
  });

  it('shows a calm note when the companion is not connected', () => {
    mockUseReport.mockReturnValue(query({ data: report({ companion: null }) }));
    const out = text(mount(<ReportsScreen />));
    expect(out).toContain("Your companion isn't connected yet");
    // The rest of the report is still there.
    expect(out).toContain('R 86,420');
    expect(out).toContain('Where bookings come from');
  });

  it('shows a skeleton while loading', () => {
    mockUseReport.mockReturnValue(query({ isPending: true }));
    const tree = mount(<ReportsScreen />);
    expect(
      tree.root.findAll(
        (n) => n.props.accessibilityLabel === 'Loading the report',
      ).length,
    ).toBeGreaterThan(0);
    expect(text(tree)).not.toContain('Revenue');
  });

  it('shows an error with a retry', () => {
    const refetch = jest.fn();
    mockUseReport.mockReturnValue(
      query({ isError: true, error: new Error('boom'), refetch }),
    );
    const tree = mount(<ReportsScreen />);
    expect(text(tree)).toContain("Couldn't load this report");
    act(() => pressableByText(tree, 'Try again').props.onPress());
    expect(refetch).toHaveBeenCalled();
  });

  it('shows an offline error when there is no connection and nothing saved', () => {
    mockUseReport.mockReturnValue(
      query({ isPending: true, fetchStatus: 'paused' }),
    );
    expect(text(mount(<ReportsScreen />))).toContain("You're offline");
  });

  it('goes back a month, and stops at the current month', () => {
    mockUseReport.mockReturnValue(query({ data: report() }));
    const tree = mount(<ReportsScreen />);
    const next = () =>
      tree.root.find(
        (n) => n.props.accessibilityLabel === 'Next month' && !!n.props.onPress,
      );
    expect(next().props.disabled).toBe(true);
    act(() =>
      tree.root
        .find(
          (n) =>
            n.props.accessibilityLabel === 'Previous month' &&
            !!n.props.onPress,
        )
        .props.onPress(),
    );
    expect(mockUseReport).toHaveBeenLastCalledWith('2026-09');
    expect(text(tree)).toContain('September 2026');
    expect(next().props.disabled).toBeFalsy();
  });

  it('opens Plans from the usage card', () => {
    mockUseReport.mockReturnValue(query({ data: report() }));
    const tree = mount(<ReportsScreen />);
    const card = tree.root.find(
      (n) =>
        typeof n.props.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.startsWith('Growth,') &&
        !!n.props.onPress,
    );
    act(() => card.props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/settings/plan');
  });
});
