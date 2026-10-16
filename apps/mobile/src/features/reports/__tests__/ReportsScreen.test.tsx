import * as React from 'react';

import { act, mount, pressableByText, text } from '@/testing/render';

import { buildReport, type ReportRow } from '../aggregate';
import { ReportsScreen } from '../components/ReportsScreen';
import { reportPeriod, type ReportRange } from '../period';

jest.mock('@/features/business/hooks', () => ({
  useBusiness: () => ({
    data: { id: 'b1', timezone: 'Africa/Johannesburg', currency: 'ZAR' },
    isPending: false,
    isError: false,
    fetchStatus: 'idle',
    error: null,
  }),
}));

const TODAY = '2026-10-14';
const mockUseReport = jest.fn();
jest.mock('../hooks', () => ({
  useReport: (range: ReportRange, tz: string) => mockUseReport(range, tz),
}));

function row(over: Partial<ReportRow> = {}): ReportRow {
  return {
    starts_at: '2026-10-14T08:00:00Z',
    status: 'completed',
    source: 'whatsapp',
    price_cents: 100_000,
    client_id: 'c1',
    staff_id: 's1',
    staff_name: 'Thandi Mokoena',
    staff_color: null,
    ...over,
  };
}

/** What `useReport` returns for `rows`, aggregated by the real pure functions. */
function result(rows: ReportRow[], over: Record<string, unknown> = {}) {
  const period = reportPeriod('month', TODAY);
  return {
    period,
    today: TODAY,
    query: {
      data: buildReport({
        rows,
        newClientIds: new Set<string>(),
        period,
        timezone: 'Africa/Johannesburg',
      }),
      isError: false,
      error: null,
      isPending: false,
      fetchStatus: 'idle',
      dataUpdatedAt: 0,
      refetch: jest.fn(),
      ...over,
    },
  };
}

const SAMPLE = [
  row({ price_cents: 250_000, source: 'whatsapp', client_id: 'a' }),
  row({ price_cents: 150_000, source: 'app', client_id: 'b' }),
  row({ source: 'nerova', status: 'no_show', client_id: 'c' }),
  row({ source: 'web', status: 'cancelled', client_id: 'd' }),
  // Previous month, same span: gives the delta something to compare with.
  row({ starts_at: '2026-09-10T08:00:00Z', price_cents: 200_000 }),
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-14T08:00:00Z'));
});
afterEach(() => jest.useRealTimers());

/** Lets the counted-up numbers settle before the text is read. */
function settleCounts() {
  act(() => {
    jest.advanceTimersByTime(1000);
  });
}

const open = (tree: ReturnType<typeof mount>, label: string) =>
  act(() => pressableByText(tree, label).props.onPress());

describe('ReportsScreen', () => {
  it('shows the board: hero, delta, bookings, and the three sections', () => {
    mockUseReport.mockReturnValue(result(SAMPLE));
    const tree = mount(<ReportsScreen />);
    settleCounts();
    const out = text(tree);
    expect(out).toContain('Reports');
    expect(out).toContain('Revenue · 1 to 14 October');
    expect(out).toContain('R 4,000');
    expect(out).toContain('+100% vs September');
    expect(out).toContain('Bookings');
    expect(out).toContain('No-show rate');
    expect(out).toContain('33%');
    expect(out).toContain('Returning clients');
    expect(out).toContain('By staff');
    expect(out).toContain('Where bookings come from');
    expect(out).toContain('Busiest times');
    expect(out).toContain('Export CSV');
  });

  it('starts on Month and asks for the range that is picked', () => {
    mockUseReport.mockReturnValue(result(SAMPLE));
    const tree = mount(<ReportsScreen />);
    expect(mockUseReport).toHaveBeenLastCalledWith(
      'month',
      'Africa/Johannesburg',
    );
    act(() => pressableByText(tree, 'Week').props.onPress());
    expect(mockUseReport).toHaveBeenLastCalledWith(
      'week',
      'Africa/Johannesburg',
    );
  });

  it('lists the two sources, WhatsApp and Clovie, and nothing else', () => {
    mockUseReport.mockReturnValue(result(SAMPLE));
    const tree = mount(<ReportsScreen />);
    open(tree, 'Where bookings come from');
    const out = text(tree);
    expect(out).toContain('WhatsApp');
    expect(out).toContain('Clovie');
    expect(out).toContain('67%');
    expect(out).toContain('33%');
    for (const gone of ['Web', 'Companion', 'Manual', 'Walk-in', 'Phone']) {
      expect(out).not.toContain(gone);
    }
  });

  it('shows staff revenue and bookings, without a made-up utilisation figure', () => {
    mockUseReport.mockReturnValue(result(SAMPLE));
    const tree = mount(<ReportsScreen />);
    open(tree, 'By staff');
    const out = text(tree);
    expect(out).toContain('Thandi Mokoena');
    expect(out).toContain('3 bookings');
    expect(out).not.toContain('busy');
  });

  it('shows the busiest time from real bookings', () => {
    mockUseReport.mockReturnValue(result(SAMPLE));
    const tree = mount(<ReportsScreen />);
    open(tree, 'Busiest times');
    expect(text(tree)).toContain('Busiest: Wednesday around 10:00');
  });

  it('is honest when there is nothing yet', () => {
    mockUseReport.mockReturnValue(result([]));
    const tree = mount(<ReportsScreen />);
    settleCounts();
    expect(text(tree)).toContain('R 0');
    expect(text(tree)).toContain('No completed bookings yet in this period.');
    expect(text(tree)).not.toContain('vs September');
    open(tree, 'Where bookings come from');
    expect(text(tree)).toContain('No bookings in this period.');
    open(tree, 'Busiest times');
    expect(text(tree)).toContain(
      'The busiest times show once there are bookings.',
    );
  });

  it('shows a skeleton while loading', () => {
    mockUseReport.mockReturnValue(
      result([], { data: undefined, isPending: true }),
    );
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
      result([], {
        data: undefined,
        isError: true,
        error: new Error('boom'),
        refetch,
      }),
    );
    const tree = mount(<ReportsScreen />);
    expect(text(tree)).toContain("Couldn't load this report");
    act(() => pressableByText(tree, 'Try again').props.onPress());
    expect(refetch).toHaveBeenCalled();
  });

  it('shows an offline error when there is no connection and nothing saved', () => {
    mockUseReport.mockReturnValue(
      result([], { data: undefined, isPending: true, fetchStatus: 'paused' }),
    );
    expect(text(mount(<ReportsScreen />))).toContain("You're offline");
  });
});
