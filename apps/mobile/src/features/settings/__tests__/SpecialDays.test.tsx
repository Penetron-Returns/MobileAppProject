import '@/lib/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act, type ReactTestInstance } from 'react-test-renderer';

import { OperatingHoursScreen } from '../components/OperatingHoursScreen';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    canGoBack: () => true,
    back: jest.fn(),
    replace: jest.fn(),
    push: (...a: unknown[]) => mockPush(...a),
  },
}));
jest.mock('@booking/ui/components/ConfirmDialog', () => {
  const { View } = require('react-native');
  return {
    ConfirmDialog: (props: Record<string, unknown>) => (
      <View testID="confirm-dialog" {...props} />
    ),
  };
});
jest.mock('@/lib/toast', () => ({
  toast: {
    info: jest.fn(),
    success: jest.fn(),
    failed: jest.fn(),
    error: jest.fn(),
  },
  describeError: () => ({ message: 'boom', requestId: null }),
}));

const mockSave = jest.fn();
const mockAddMany = jest.fn();
const mockDelete = jest.fn();
const mockCheck = jest.fn();
const mockHooks: Record<string, unknown> = {};
let mockSaveOpts: { onError?: (e: unknown) => boolean | void } = {};

jest.mock('@/features/business/hooks', () => ({
  useBusinessHours: () => mockHooks.hours,
  useReplaceBusinessHours: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/features/business/me', () => ({ useCanManage: () => true }));
jest.mock('@/features/availability/hooks', () => ({
  useAvailabilityConfig: () => mockHooks.config,
  useUpcomingWindow: () => ({
    today: '2026-10-15',
    from: '2026-10-15',
    to: '2027-10-15',
    timezone: 'Africa/Johannesburg',
  }),
  useDeleteSpecialDay: () => ({ mutate: mockDelete, isPending: false }),
  useSaveSpecialDay: (opts: typeof mockSaveOpts) => {
    mockSaveOpts = opts;
    return { mutate: mockSave, isPending: false };
  },
  useAddSpecialDays: () => ({ mutate: mockAddMany, isPending: false }),
  useSpecialDaySuggestions: () => mockHooks.suggestions,
  useConflictCheck: () => mockCheck,
  useConflictNames: () =>
    new Map([['a1', { client: 'Thabo', service: "Men's Haircut" }]]),
}));

const ok = <T,>(data: T) => ({
  data,
  isPending: false,
  isError: false,
  error: null,
  fetchStatus: 'idle',
  dataUpdatedAt: 1,
  refetch: jest.fn(),
});

// New days list holiday suggestions, so the button saves the custom form.
const SAVE = 'Add custom day';

const METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
  frame: { x: 0, y: 0, width: 402, height: 874 },
};

function mount() {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <QueryClientProvider client={new QueryClient()}>
        <SafeAreaProvider initialMetrics={METRICS}>
          <OperatingHoursScreen />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
  });
  return tree;
}

const byLabel = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll((n) => n.props.accessibilityLabel === label);
const press = (tree: renderer.ReactTestRenderer, label: string) =>
  act(() =>
    tree.root
      .find((n) => n.props.accessibilityLabel === label && !!n.props.onPress)
      .props.onPress(),
  );
const pressAsync = async (tree: renderer.ReactTestRenderer, label: string) => {
  await act(async () => {
    tree.root
      .find((n) => n.props.accessibilityLabel === label && !!n.props.onPress)
      .props.onPress();
  });
};
const text = (tree: renderer.ReactTestRenderer) =>
  JSON.stringify(tree.toJSON(), (k, v) =>
    k === 'refreshControl' ? undefined : v,
  );
const input = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.find(
    (n: ReactTestInstance) =>
      n.type === TextInput && n.props.accessibilityLabel === label,
  );

const day = (o: Record<string, unknown>) => ({
  id: 'sd-1',
  date: '2026-12-25',
  name: 'Christmas Day',
  kind: 'public_holiday',
  is_closed: true,
  start_time: null,
  end_time: null,
  ...o,
});
const suggestion = (date: string, name: string) => ({
  date,
  name,
  kind: 'public_holiday',
  is_closed: true,
  observed_for: null,
  added: false,
  special_day_id: null,
});
const appointment = (id: string, startsAt: string) => ({
  id,
  starts_at: startsAt,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockHooks.hours = ok([
    { weekday: 1, opens_at: '09:00:00', closes_at: '18:00:00' },
  ]);
  mockHooks.config = ok({
    special_days: [
      day({
        id: 'sd-2',
        date: '2026-12-26',
        name: 'Day of Goodwill',
        is_closed: false,
        kind: 'special_hours',
        start_time: '09:00:00',
        end_time: '13:00:00',
      }),
      day({}),
      day({ id: 'sd-0', date: '2026-10-01', name: 'Already past' }),
    ],
  });
  mockHooks.suggestions = {
    suggestions: [
      suggestion('2026-12-16', 'Day of Reconciliation'),
      { ...suggestion('2026-12-25', 'Christmas Day'), added: true },
    ],
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  };
  mockCheck.mockResolvedValue([]);
});

describe('Holidays and special days', () => {
  it('lists upcoming days by date with their value, always visible', () => {
    const tree = mount();
    const json = text(tree);
    expect(json.indexOf('Christmas Day')).toBeLessThan(
      json.indexOf('Day of Goodwill'),
    );
    expect(json).not.toContain('Already past');
    expect(json).toContain('Fri 25 Dec');
    expect(json).toContain('09:00-13:00');
    expect(
      byLabel(tree, 'Christmas Day, Fri 25 Dec, Closed').length,
    ).toBeGreaterThan(0);
    expect(json).toContain(
      "Customers can only book inside these hours and each team member's own hours.",
    );
    expect(byLabel(tree, 'Add special day').length).toBeGreaterThan(0);
  });

  it('offers only upcoming public holidays not yet added, and adds one as closed', async () => {
    const tree = mount();
    press(tree, 'Add special day');
    expect(text(tree)).toContain('Public holidays');
    expect(
      byLabel(tree, 'Add Christmas Day, Fri 25 Dec, as a closed day'),
    ).toHaveLength(0);
    await pressAsync(
      tree,
      'Add Day of Reconciliation, Wed 16 Dec, as a closed day',
    );
    expect(mockCheck).toHaveBeenCalledWith([
      { from: '2026-12-16', mode: 'closed' },
    ]);
    expect(mockAddMany).toHaveBeenCalledWith([
      {
        date: '2026-12-16',
        name: 'Day of Reconciliation',
        kind: 'public_holiday',
        is_closed: true,
      },
    ]);
  });

  it('adds every upcoming public holiday in one go', async () => {
    mockHooks.suggestions = {
      ...(mockHooks.suggestions as object),
      suggestions: [
        suggestion('2026-12-16', 'Day of Reconciliation'),
        suggestion('2027-01-01', "New Year's Day"),
      ],
    };
    const tree = mount();
    press(tree, 'Add special day');
    await pressAsync(tree, 'Add all upcoming public holidays (2)');
    expect(mockCheck).toHaveBeenCalledWith([
      { from: '2026-12-16', mode: 'closed' },
      { from: '2027-01-01', mode: 'closed' },
    ]);
    expect(mockAddMany.mock.calls[0][0]).toHaveLength(2);
  });

  it('saves a custom closed day with a name after a clean bookings check', async () => {
    const tree = mount();
    press(tree, 'Add special day');
    act(() => input(tree, 'Name').props.onChangeText('Staff party'));
    await pressAsync(tree, SAVE);
    expect(mockSave).toHaveBeenCalledWith({
      id: null,
      body: {
        date: '2026-10-15',
        name: 'Staff party',
        kind: 'closure',
        is_closed: true,
        start_time: null,
        end_time: null,
      },
    });
  });

  it('needs a name', async () => {
    const tree = mount();
    press(tree, 'Add special day');
    await pressAsync(tree, SAVE);
    expect(mockSave).not.toHaveBeenCalled();
    expect(text(tree)).toContain('Give the day a name.');
  });

  it('saves special hours checked as open-only, from the time wheel', async () => {
    const tree = mount();
    press(tree, 'Add special day');
    act(() => input(tree, 'Name').props.onChangeText('Early close'));
    press(tree, 'Special hours');
    press(tree, 'Open ends at 13:00');
    press(tree, 'Hour 12');
    await pressAsync(tree, SAVE);
    expect(mockCheck).toHaveBeenCalledWith([
      {
        from: '2026-10-15',
        start_time: '09:00',
        end_time: '12:00',
        mode: 'open_only',
      },
    ]);
    expect(mockSave.mock.calls[0][0].body).toMatchObject({
      kind: 'special_hours',
      start_time: '09:00',
      end_time: '12:00',
    });
  });

  it('picks the date from the month grid', async () => {
    const tree = mount();
    press(tree, 'Add special day');
    press(tree, 'Date, Thu 15 Oct');
    press(tree, 'Next month');
    press(tree, 'Friday 20 November');
    expect(byLabel(tree, 'Date, Fri 20 Nov').length).toBeGreaterThan(0);
  });
});

describe('Bookings in the way', () => {
  const conflicts = [
    appointment('a1', '2026-10-15T08:00:00.000Z'),
    appointment('a2', '2026-10-15T09:30:00.000Z'),
  ];

  async function openWithConflicts() {
    mockCheck.mockResolvedValue(conflicts);
    const tree = mount();
    press(tree, 'Add special day');
    act(() => input(tree, 'Name').props.onChangeText('Staff party'));
    await pressAsync(tree, SAVE);
    return tree;
  }

  it('lists the bookings instead of saving, and never cancels them', async () => {
    const tree = await openWithConflicts();
    const json = text(tree);
    expect(json).toContain('2 bookings that day');
    expect(json).toContain("10:00 Thabo, Men's Haircut");
    expect(json).toContain('11:30');
    expect(json).toContain('Nothing is cancelled or moved');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('saves anyway when asked, leaving the bookings alone', async () => {
    const tree = await openWithConflicts();
    await pressAsync(tree, 'Save anyway (bookings stay)');
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.calls[0][0].body.name).toBe('Staff party');
  });

  it('goes back to the form on Cancel without saving', async () => {
    const tree = await openWithConflicts();
    // The panel's Cancel is the last one (the sheet has its own at the top).
    const cancels = tree.root.findAll(
      (n) => n.props.accessibilityLabel === 'Cancel' && !!n.props.onPress,
    );
    act(() => cancels[cancels.length - 1].props.onPress());
    expect(mockSave).not.toHaveBeenCalled();
    expect(text(tree)).not.toContain('bookings that day');
    expect(input(tree, 'Name').props.value).toBe('Staff party');
  });

  it('opens a listed booking', async () => {
    const tree = await openWithConflicts();
    press(tree, "Open booking 10:00 Thabo, Men's Haircut");
    expect(mockPush).toHaveBeenCalledWith('/bookings/a1');
  });

  it('says why when the check cannot run, and saves nothing', async () => {
    mockCheck.mockRejectedValue(new Error('offline'));
    const tree = mount();
    press(tree, 'Add special day');
    act(() => input(tree, 'Name').props.onChangeText('Staff party'));
    await pressAsync(tree, SAVE);
    expect(mockSave).not.toHaveBeenCalled();
    const { toast } = jest.requireMock('@/lib/toast');
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('Editing and deleting a special day', () => {
  it('opens a day for editing and saves a rename without a bookings check', async () => {
    const tree = mount();
    press(tree, 'Christmas Day, Fri 25 Dec, Closed');
    expect(text(tree)).toContain('Edit special day');
    expect(text(tree)).not.toContain('Public holidays');
    act(() => input(tree, 'Name').props.onChangeText('Christmas'));
    await pressAsync(tree, 'Save');
    expect(mockCheck).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledWith({
      id: 'sd-1',
      body: expect.objectContaining({
        name: 'Christmas',
        kind: 'public_holiday',
        is_closed: true,
      }),
    });
  });

  it('checks the bookings when an edit turns a closed day into special hours', async () => {
    const tree = mount();
    press(tree, 'Christmas Day, Fri 25 Dec, Closed');
    press(tree, 'Special hours');
    await pressAsync(tree, 'Save');
    expect(mockCheck).toHaveBeenCalledWith([
      {
        from: '2026-12-25',
        start_time: '09:00',
        end_time: '13:00',
        mode: 'open_only',
      },
    ]);
  });

  it('confirms before deleting, after closing the sheet', () => {
    const tree = mount();
    press(tree, 'Christmas Day, Fri 25 Dec, Closed');
    press(tree, 'Delete special day');
    expect(text(tree)).not.toContain('Edit special day');
    const dialog = tree.root.findByProps({ testID: 'confirm-dialog' });
    expect(dialog.props.open).toBe(true);
    expect(dialog.props.title).toBe('Delete Christmas Day?');
    act(() => dialog.props.onConfirm());
    expect(mockDelete).toHaveBeenCalledWith('sd-1');
  });

  it('explains a date that already has a special day', async () => {
    const tree = mount();
    press(tree, 'Add special day');
    act(() => input(tree, 'Name').props.onChangeText('Again'));
    await pressAsync(tree, SAVE);
    act(() => {
      mockSaveOpts.onError?.(
        Object.assign(
          new (jest.requireActual('@/lib/api').ApiError)({
            code: 'VALIDATION_FAILED',
            message: 'x',
            status: 400,
            details: { special_day_id: 'sd-1' },
          }),
        ),
      );
    });
    expect(text(tree)).toContain(
      'There is already a special day on that date.',
    );
  });
});

describe('Special day swipe action', () => {
  it('offers Delete on a day and asks before deleting', () => {
    const tree = mount();
    const [first] = byLabel(tree, 'Delete').filter((n) => !!n.props.onPress);
    act(() => first.props.onPress());
    const dialog = tree.root.findByProps({ testID: 'confirm-dialog' });
    expect(dialog.props.open).toBe(true);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
