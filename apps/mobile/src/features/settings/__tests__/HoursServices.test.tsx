import '@/lib/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act, type ReactTestInstance } from 'react-test-renderer';

import { OperatingHoursScreen } from '../components/OperatingHoursScreen';
import { ServicesScreen } from '../components/ServicesScreen';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({
  router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn() },
}));

// The confirm dialog portals into a host the test renderer lacks: render its
// props as a plain element so a test can read `open` and call `onConfirm`.
jest.mock('@booking/ui/components/ConfirmDialog', () => {
  const { View } = require('react-native');
  return {
    ConfirmDialog: (props: Record<string, unknown>) => (
      <View testID="confirm-dialog" {...props} />
    ),
  };
});

const mockToastBlocked = jest.fn();
const mockToastSuccess = jest.fn();
jest.mock('@/lib/toast', () => ({
  toast: {
    blocked: (...a: unknown[]) => mockToastBlocked(...a),
    success: (...a: unknown[]) => mockToastSuccess(...a),
    failed: jest.fn(),
  },
  describeError: () => ({ message: 'boom', requestId: null }),
}));

const mockHooks: Record<string, unknown> = {};
const mockReplace = jest.fn();
const mockSave = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/features/business/hooks', () => ({
  useBusinessHours: () => mockHooks.hours,
  useBusiness: () => mockHooks.business,
  useReplaceBusinessHours: () => ({ mutate: mockReplace, isPending: false }),
}));
jest.mock('@/features/availability/hooks', () => ({
  useAvailabilityConfig: () => ({
    data: { special_days: [] },
    isPending: false,
    isError: false,
    error: null,
    fetchStatus: 'idle',
    dataUpdatedAt: 1,
    refetch: jest.fn(),
  }),
  useUpcomingWindow: () => ({
    today: '2026-10-15',
    from: '2026-10-15',
    to: '2027-10-15',
    timezone: 'Africa/Johannesburg',
  }),
  useDeleteSpecialDay: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/features/business/me', () => ({
  useCanManage: () => mockHooks.canManage,
}));
jest.mock('@/features/catalog/hooks', () => ({
  useServices: () => mockHooks.services,
  useStaff: () => mockHooks.staff,
  useStaffServices: () => mockHooks.links,
  useSaveService: () => ({ mutate: mockSave, isPending: false }),
  useDeleteService: () => ({ mutate: mockDelete, isPending: false }),
}));

function ok<T>(data: T) {
  return {
    data,
    isPending: false,
    isError: false,
    isSuccess: true,
    error: null,
    fetchStatus: 'idle',
    dataUpdatedAt: 1,
    refetch: jest.fn(),
  };
}

const METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
  frame: { x: 0, y: 0, width: 402, height: 874 },
};

function mount(ui: React.ReactElement) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <QueryClientProvider client={new QueryClient()}>
        <SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>
      </QueryClientProvider>,
    );
  });
  return tree;
}

const byLabel = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll((n) => n.props.accessibilityLabel === label);
function press(tree: renderer.ReactTestRenderer, label: string) {
  const node = tree.root.find(
    (n) => n.props.accessibilityLabel === label && !!n.props.onPress,
  );
  act(() => node.props.onPress());
}
const text = (tree: renderer.ReactTestRenderer) =>
  JSON.stringify(tree.toJSON(), (k, v) =>
    k === 'refreshControl' ? undefined : v,
  );
function input(tree: renderer.ReactTestRenderer, label: string) {
  return tree.root.find(
    (n: ReactTestInstance) =>
      n.type === TextInput && n.props.accessibilityLabel === label,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHooks.canManage = true;
});

describe('Operating hours screen', () => {
  const week = (rows: { weekday: number; opens: string; closes: string }[]) =>
    ok(
      rows.map((r) => ({
        weekday: r.weekday,
        opens_at: `${r.opens}:00`,
        closes_at: `${r.closes}:00`,
      })),
    );

  beforeEach(() => {
    mockHooks.hours = week([
      { weekday: 1, opens: '09:00', closes: '10:00' },
      { weekday: 2, opens: '09:00', closes: '17:00' },
    ]);
  });

  it('lists the week with times, Closed days and the board hint', () => {
    const tree = mount(<OperatingHoursScreen />);
    const json = text(tree);
    expect(json).toContain('Operating hours');
    expect(byLabel(tree, 'Monday opens at 09:00').length).toBeGreaterThan(0);
    expect(byLabel(tree, 'Tuesday closes at 17:00').length).toBeGreaterThan(0);
    expect(json).toContain('Closed');
    expect(json).toContain('Tap a time to change it.');
  });

  it('opens a day by its switch', () => {
    const tree = mount(<OperatingHoursScreen />);
    expect(byLabel(tree, 'Sunday opens at 09:00')).toHaveLength(0);
    press(tree, 'Sunday open');
    expect(byLabel(tree, 'Sunday opens at 09:00').length).toBeGreaterThan(0);
  });

  it('changes a time from the wheel and closes the wheel with Done', () => {
    const tree = mount(<OperatingHoursScreen />);
    expect(byLabel(tree, 'Hour 10')).toHaveLength(0);
    press(tree, 'Tuesday opens at 09:00');
    expect(text(tree)).toContain('Tuesday opens');
    press(tree, 'Hour 10');
    expect(byLabel(tree, 'Tuesday opens at 10:00').length).toBeGreaterThan(0);
    press(tree, 'Done');
    expect(byLabel(tree, 'Hour 10')).toHaveLength(0);
  });

  it('refuses to save a closing time before opening and says which day', () => {
    const tree = mount(<OperatingHoursScreen />);
    press(tree, 'Monday closes at 10:00');
    press(tree, 'Hour 08');
    press(tree, 'Save Changes');
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockToastBlocked).toHaveBeenCalledWith(
      'Monday: closing time must be after opening time.',
    );
  });

  it('saves the week as rows', () => {
    const tree = mount(<OperatingHoursScreen />);
    press(tree, 'Save Changes');
    expect(mockReplace).toHaveBeenCalledWith([
      { weekday: 1, opens_at: '09:00', closes_at: '10:00' },
      { weekday: 2, opens_at: '09:00', closes_at: '17:00' },
    ]);
  });

  it('has one range per day: no way to add a second one', () => {
    const tree = mount(<OperatingHoursScreen />);
    press(tree, 'Tuesday closes at 17:00');
    expect(byLabel(tree, 'Add hours')).toHaveLength(0);
    expect(byLabel(tree, 'Remove these hours')).toHaveLength(0);
  });

  it('is read only for staff: no save footer, fields disabled', () => {
    mockHooks.canManage = false;
    const tree = mount(<OperatingHoursScreen />);
    expect(byLabel(tree, 'Save Changes')).toHaveLength(0);
    const field = tree.root.find(
      (n) => n.props.accessibilityLabel === 'Monday opens at 09:00',
    );
    expect(field.props.disabled).toBe(true);
  });
});

describe('Services screen', () => {
  const service = {
    id: 'sv-1',
    name: "Women's Haircut",
    description: null,
    category: 'Hair',
    duration_minutes: 60,
    price_cents: 85000,
    deposit_cents: 0,
    is_active: true,
    sort_order: 10,
  };
  const hidden = {
    ...service,
    id: 'sv-2',
    name: 'Gel Manicure',
    category: 'Nails',
    duration_minutes: 45,
    price_cents: 35050,
    is_active: false,
  };

  beforeEach(() => {
    mockHooks.business = ok({ currency: 'ZAR', timezone: 'UTC', name: 'B' });
    mockHooks.services = ok([service, hidden]);
    mockHooks.staff = ok([
      { id: 's-1', name: 'Thandi Mokoena', color: '#007AFF', is_active: true },
      { id: 's-2', name: 'Ruan van Wyk', color: '#FF9500', is_active: true },
      { id: 's-3', name: 'Gone Person', color: null, is_active: false },
    ]);
    mockHooks.links = ok([{ staff_id: 's-1', service_id: 'sv-1' }]);
  });

  it('shows the summary, categories and rows as the board writes them', () => {
    const tree = mount(<ServicesScreen />);
    const json = text(tree);
    expect(json).toContain('2 services. Tap one to edit.');
    expect(json).toContain('Hair');
    expect(json).toContain('Nails');
    expect(json).toContain('1 h · R850');
    expect(json).toContain('45 min · R350.50 · Hidden');
    expect(byLabel(tree, 'Add a service').length).toBeGreaterThan(0);
  });

  it('hides the add action and rows are not pressable for staff', () => {
    mockHooks.canManage = false;
    const tree = mount(<ServicesScreen />);
    expect(byLabel(tree, 'Add a service')).toHaveLength(0);
  });

  it('opens the editor with the service and saves the edits with who does it', async () => {
    const tree = mount(<ServicesScreen />);
    press(tree, "Women's Haircut, 1 h · R850");
    expect(text(tree)).toContain('Edit service');
    // Active team only, first names, the linked person selected.
    expect(byLabel(tree, 'Gone Person')).toHaveLength(0);
    // The last match is the host element that carries the state.
    const thandi = tree.root
      .findAll(
        (n) =>
          n.props.accessibilityLabel === 'Thandi Mokoena' && !!n.props.onPress,
      )
      .pop();
    expect(thandi?.props.accessibilityState).toEqual({ selected: true });

    act(() => input(tree, 'Name').props.onChangeText('Cut and blow-dry'));
    press(tree, 'Longer');
    press(tree, 'Ruan van Wyk');
    await act(async () => {
      tree.root
        .find((n) => n.props.accessibilityLabel === 'Save' && !!n.props.onPress)
        .props.onPress();
    });
    expect(mockSave).toHaveBeenCalledWith({
      id: 'sv-1',
      body: {
        name: 'Cut and blow-dry',
        category: 'Hair',
        duration_minutes: 75,
        price_cents: 85000,
        is_active: true,
        staff_ids: ['s-1', 's-2'],
      },
    });
  });

  it('creates a new service with no delete action', async () => {
    const tree = mount(<ServicesScreen />);
    press(tree, 'Add a service');
    expect(text(tree)).toContain('New service');
    press(tree, 'More options');
    expect(byLabel(tree, 'Delete service')).toHaveLength(0);
    act(() => input(tree, 'Name').props.onChangeText('Brow tint'));
    act(() => input(tree, 'Price').props.onChangeText('220'));
    await act(async () => {
      tree.root
        .find((n) => n.props.accessibilityLabel === 'Save' && !!n.props.onPress)
        .props.onPress();
    });
    expect(mockSave).toHaveBeenCalledWith({
      id: null,
      body: expect.objectContaining({
        name: 'Brow tint',
        price_cents: 22000,
        duration_minutes: 30,
        staff_ids: [],
      }),
    });
  });

  it('does not save an unnamed service', async () => {
    const tree = mount(<ServicesScreen />);
    press(tree, 'Add a service');
    await act(async () => {
      tree.root
        .find((n) => n.props.accessibilityLabel === 'Save' && !!n.props.onPress)
        .props.onPress();
    });
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('asks before deleting, from the screen, and deletes on confirm', () => {
    const tree = mount(<ServicesScreen />);
    press(tree, "Women's Haircut, 1 h · R850");
    press(tree, 'More options');
    press(tree, 'Delete service');
    // The sheet closed and the confirm is open outside it.
    expect(text(tree)).not.toContain('Edit service');
    const dialog = tree.root.find((n) => n.props.testID === 'confirm-dialog');
    expect(dialog.props.open).toBe(true);
    expect(mockDelete).not.toHaveBeenCalled();
    act(() => dialog.props.onConfirm());
    expect(mockDelete).toHaveBeenCalledWith('sv-1');
  });

  it('keeps the service when the confirm is dismissed', () => {
    const tree = mount(<ServicesScreen />);
    press(tree, "Women's Haircut, 1 h · R850");
    press(tree, 'More options');
    press(tree, 'Delete service');
    const dialog = tree.root.find((n) => n.props.testID === 'confirm-dialog');
    act(() => dialog.props.onOpenChange(false));
    expect(mockDelete).not.toHaveBeenCalled();
    expect(
      tree.root.find((n) => n.props.testID === 'confirm-dialog').props.open,
    ).toBe(false);
  });

  it('leaves who-does-it links alone while the team has not loaded', () => {
    mockHooks.staff = { ...ok(undefined), data: undefined, isPending: true };
    const tree = mount(<ServicesScreen />);
    press(tree, "Women's Haircut, 1 h · R850");
    expect(text(tree)).not.toContain('Who does it');
  });
});
