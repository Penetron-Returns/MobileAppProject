import '@/lib/i18n';

import * as React from 'react';
import { TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { PersonSchedule } from '../components/PersonSchedule';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn() },
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

const mockReplaceBreaks = jest.fn();
const mockSaveTimeOff = jest.fn();
const mockDeleteTimeOff = jest.fn();
const mockReplaceAvailability = jest.fn();
const mockCheck = jest.fn();
const mockHooks: { config: unknown } = { config: null };
let mockBreaksOpts: { onError?: (e: unknown) => boolean | void } = {};

jest.mock('@/features/availability/hooks', () => ({
  useAvailabilityConfig: () => mockHooks.config,
  useUpcomingWindow: () => ({
    today: '2026-10-15',
    from: '2026-10-15',
    to: '2027-10-15',
    timezone: 'Africa/Johannesburg',
  }),
  useReplaceStaffBreaks: (opts: typeof mockBreaksOpts) => {
    mockBreaksOpts = opts;
    return { mutate: mockReplaceBreaks, isPending: false };
  },
  useSaveTimeOff: () => ({ mutate: mockSaveTimeOff, isPending: false }),
  useDeleteTimeOff: () => ({ mutate: mockDeleteTimeOff, isPending: false }),
  useReplaceStaffAvailability: () => ({
    mutate: mockReplaceAvailability,
    isPending: false,
  }),
  useConflictCheck: () => mockCheck,
  useConflictNames: () => new Map(),
}));

const STAFF = 's-1';
const lunch = {
  id: 'b-1',
  staff_id: STAFF,
  label: 'Lunch',
  start_time: '13:00:00',
  end_time: '13:30:00',
  weekdays: [],
};
const leave = {
  id: 't-1',
  staff_id: STAFF,
  starts_on: '2026-12-24',
  ends_on: '2026-12-26',
  start_time: null,
  end_time: null,
  reason: 'leave',
  note: null,
};
const BUSINESS = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  opens_at: '08:00:00',
  closes_at: '18:00:00',
}));

function config(
  overrides: Partial<{ breaks: unknown[]; time_off: unknown[] }> = {},
) {
  return {
    data: {
      staff: [
        {
          staff_id: STAFF,
          rules: [],
          breaks: [lunch],
          time_off: [leave],
          overrides: [],
          ...overrides,
        },
      ],
    },
    isPending: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  };
}

const week = [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
  weekday,
  ranges: weekday >= 1 && weekday <= 5 ? [{ from: '08:00', to: '17:00' }] : [],
}));

const METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
  frame: { x: 0, y: 0, width: 402, height: 874 },
};

function mount(
  props: Partial<React.ComponentProps<typeof PersonSchedule>> = {},
) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <QueryClientProvider client={new QueryClient()}>
        <SafeAreaProvider initialMetrics={METRICS}>
          <PersonSchedule
            staffId={STAFF}
            week={week}
            inherited={false}
            rules={[1, 2, 3, 4, 5].map((weekday) => ({
              weekday,
              start_time: '08:00:00',
              end_time: '17:00:00',
            }))}
            businessHours={BUSINESS}
            onPresentChange={jest.fn()}
            {...props}
          />
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
  JSON.stringify(tree.toJSON());
const input = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.find(
    (n: ReactTestInstance) =>
      n.type === TextInput && n.props.accessibilityLabel === label,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockHooks.config = config();
  mockCheck.mockResolvedValue([]);
});

describe('Person schedule sections', () => {
  it('summarises Working days, Breaks and Time off as the board does', () => {
    const json = text(mount());
    expect(json).toContain('Working days');
    expect(json).toContain('Breaks');
    expect(json).toContain('Lunch 13:00 to 13:30');
    expect(json).toContain('Time off');
    expect(json).toContain('24 to 26 Dec');
  });

  it('says so when there are no breaks or time off', () => {
    mockHooks.config = config({ breaks: [], time_off: [] });
    const json = text(mount());
    expect(json).toContain('No breaks');
    expect(json).toContain('Nothing planned');
  });

  it('opens one section at a time with its lines and action', () => {
    const tree = mount();
    press(tree, 'Breaks, Lunch 13:00 to 13:30');
    expect(byLabel(tree, 'Add a break').length).toBeGreaterThan(0);
    expect(text(tree)).toContain('Every working day');
    press(tree, 'Time off, 24 to 26 Dec');
    expect(byLabel(tree, 'Add a break')).toHaveLength(0);
    expect(byLabel(tree, 'Add time off').length).toBeGreaterThan(0);
    expect(text(tree)).toContain('Leave');
  });

  it('reports a sheet being open so the page can shrink behind it', () => {
    const onPresentChange = jest.fn();
    const tree = mount({ onPresentChange });
    press(tree, 'Breaks, Lunch 13:00 to 13:30');
    press(tree, 'Add a break');
    expect(onPresentChange).toHaveBeenLastCalledWith(true);
  });
});

describe('Working days editor', () => {
  function open(
    props: Partial<React.ComponentProps<typeof PersonSchedule>> = {},
  ) {
    const tree = mount(props);
    press(
      tree,
      props.inherited
        ? 'Working days, Same as business hours, Mon to Fri, 08:00 to 17:00'
        : 'Working days, Mon to Fri, 08:00 to 17:00',
    );
    press(tree, 'Change hours');
    return tree;
  }

  it('saves one range per day as rules', async () => {
    const tree = open();
    await pressAsync(tree, 'Save');
    expect(mockReplaceAvailability).toHaveBeenCalledWith({
      staffId: STAFF,
      rules: [1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        start_time: '08:00',
        end_time: '17:00',
      })),
    });
  });

  it('hints and refuses hours outside the business hours', async () => {
    const tree = open();
    press(tree, 'Monday closes at 17:00');
    press(tree, 'Hour 19');
    expect(text(tree)).toContain('Business hours are 08:00 to 18:00');
    await pressAsync(tree, 'Save');
    expect(mockReplaceAvailability).not.toHaveBeenCalled();
    expect(text(tree)).toContain(
      'Monday: these hours fall outside the business hours.',
    );
  });

  it('refuses a day the business is closed', async () => {
    const tree = open();
    press(tree, 'Saturday open');
    expect(text(tree)).toContain('The business is closed on Saturday.');
    await pressAsync(tree, 'Save');
    expect(mockReplaceAvailability).not.toHaveBeenCalled();
  });

  it('goes back to the business hours by clearing the rules', () => {
    const tree = open();
    press(tree, 'Use business hours');
    expect(mockReplaceAvailability).toHaveBeenCalledWith({
      staffId: STAFF,
      rules: [],
    });
  });

  it('does not offer to reset when the person already follows the business', () => {
    const tree = open({ inherited: true, rules: [] });
    expect(byLabel(tree, 'Use business hours')).toHaveLength(0);
  });
});

describe('Breaks editor', () => {
  const openAdd = () => {
    const tree = mount();
    press(tree, 'Breaks, Lunch 13:00 to 13:30');
    press(tree, 'Add a break');
    return tree;
  };

  it('starts with Lunch every working day and saves the full set', async () => {
    const tree = openAdd();
    expect(input(tree, 'Name').props.value).toBe('Lunch');
    act(() => input(tree, 'Name').props.onChangeText('Tea'));
    press(tree, 'Break starts at 13:00');
    press(tree, 'Hour 11');
    press(tree, 'Break ends at 13:30');
    press(tree, 'Hour 12');
    press(tree, 'Monday');
    press(tree, 'Wednesday');
    await pressAsync(tree, 'Save');
    expect(mockReplaceBreaks).toHaveBeenCalledWith({
      staffId: STAFF,
      breaks: [
        {
          label: 'Lunch',
          start_time: '13:00',
          end_time: '13:30',
          weekdays: [],
        },
        {
          label: 'Tea',
          start_time: '11:00',
          end_time: '12:30',
          weekdays: [1, 3],
        },
      ],
    });
  });

  it('refuses a break that overlaps another, before asking the server', async () => {
    const tree = openAdd();
    await pressAsync(tree, 'Save');
    expect(mockReplaceBreaks).not.toHaveBeenCalled();
    expect(text(tree)).toContain(
      'That break overlaps another break on the same day.',
    );
  });

  it('shows the server overlap rule clearly too', () => {
    const tree = openAdd();
    const { ApiError } = jest.requireActual('@/lib/api');
    let handled: unknown;
    act(() => {
      handled = mockBreaksOpts.onError?.(
        new ApiError({
          code: 'RULE_VIOLATION',
          message: 'x',
          status: 422,
          details: { rule: 'OVERLAPPING_BREAKS' },
        }),
      );
    });
    expect(handled).toBe(true);
    expect(text(tree)).toContain(
      'That break overlaps another break on the same day.',
    );
  });

  it('edits a break in place and keeps the others', async () => {
    const tree = mount();
    press(tree, 'Breaks, Lunch 13:00 to 13:30');
    press(tree, 'Lunch, 13:00 to 13:30. Edit');
    expect(text(tree)).toContain('Edit break');
    act(() => input(tree, 'Name').props.onChangeText('Long lunch'));
    await pressAsync(tree, 'Save');
    expect(mockReplaceBreaks).toHaveBeenCalledWith({
      staffId: STAFF,
      breaks: [
        {
          label: 'Long lunch',
          start_time: '13:00',
          end_time: '13:30',
          weekdays: [],
        },
      ],
    });
  });

  it('deletes after a confirm by saving the set without it', () => {
    const tree = mount();
    press(tree, 'Breaks, Lunch 13:00 to 13:30');
    press(tree, 'Lunch, 13:00 to 13:30. Edit');
    press(tree, 'Delete break');
    const dialog = tree.root.findByProps({ testID: 'confirm-dialog' });
    expect(dialog.props.open).toBe(true);
    act(() => dialog.props.onConfirm());
    expect(mockReplaceBreaks).toHaveBeenCalledWith({
      staffId: STAFF,
      breaks: [],
    });
  });
});

describe('Time off editor', () => {
  const openAdd = () => {
    const tree = mount();
    press(tree, 'Time off, 24 to 26 Dec');
    press(tree, 'Add time off');
    return tree;
  };

  it('defaults to one all-day leave day and saves it after a clean check', async () => {
    const tree = openAdd();
    await pressAsync(tree, 'Save');
    expect(mockCheck).toHaveBeenCalledWith([
      { from: '2026-10-15', to: '2026-10-15', staff_id: STAFF, mode: 'closed' },
    ]);
    expect(mockSaveTimeOff).toHaveBeenCalledWith({
      id: null,
      staffId: STAFF,
      body: {
        starts_on: '2026-10-15',
        ends_on: '2026-10-15',
        start_time: null,
        end_time: null,
        reason: 'leave',
        note: null,
      },
    });
  });

  it('takes a reason, a note and a time range instead of all day', async () => {
    const tree = openAdd();
    press(tree, 'Training');
    act(() => input(tree, 'Note').props.onChangeText('Colour course'));
    act(() =>
      tree.root
        .find(
          (n) =>
            n.props.accessibilityLabel === 'All day' &&
            !!n.props.onCheckedChange,
        )
        .props.onCheckedChange(false),
    );
    await pressAsync(tree, 'Save');
    expect(mockCheck).toHaveBeenCalledWith([
      {
        from: '2026-10-15',
        to: '2026-10-15',
        staff_id: STAFF,
        mode: 'closed',
        start_time: '09:00',
        end_time: '13:00',
      },
    ]);
    expect(mockSaveTimeOff.mock.calls[0][0].body).toMatchObject({
      reason: 'training',
      note: 'Colour course',
      start_time: '09:00',
      end_time: '13:00',
    });
  });

  it('moves the last day with the first day while it is a single day', () => {
    const tree = openAdd();
    press(tree, 'From, Thu 15 Oct');
    press(tree, 'Friday 16 October');
    expect(byLabel(tree, 'To, Fri 16 Oct').length).toBeGreaterThan(0);
  });

  it('shows the bookings in the way and saves only on Save anyway', async () => {
    mockCheck.mockResolvedValue([
      { id: 'a1', starts_at: '2026-10-15T08:00:00.000Z' },
    ]);
    const tree = openAdd();
    await pressAsync(tree, 'Save');
    expect(text(tree)).toContain('1 booking in that time');
    expect(mockSaveTimeOff).not.toHaveBeenCalled();
    press(tree, 'Open booking 10:00');
    expect(mockPush).toHaveBeenCalledWith('/bookings/a1');
  });

  it('keeps the draft and saves nothing when Cancel is chosen on the list', async () => {
    mockCheck.mockResolvedValue([
      { id: 'a1', starts_at: '2026-10-15T08:00:00.000Z' },
    ]);
    const tree = openAdd();
    await pressAsync(tree, 'Save');
    const cancels = tree.root.findAll(
      (n) => n.props.accessibilityLabel === 'Cancel' && !!n.props.onPress,
    );
    act(() => cancels[cancels.length - 1].props.onPress());
    expect(mockSaveTimeOff).not.toHaveBeenCalled();
    expect(byLabel(tree, 'Training').length).toBeGreaterThan(0);
  });

  it('edits and deletes an entry', async () => {
    const tree = mount();
    press(tree, 'Time off, 24 to 26 Dec');
    press(tree, 'Leave, 24 to 26 Dec. Edit');
    expect(text(tree)).toContain('Edit time off');
    press(tree, 'Delete time off');
    const dialog = tree.root.findByProps({ testID: 'confirm-dialog' });
    act(() => dialog.props.onConfirm());
    expect(mockDeleteTimeOff).toHaveBeenCalledWith('t-1');
  });
});
