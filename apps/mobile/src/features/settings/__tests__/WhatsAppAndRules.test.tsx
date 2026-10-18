import '@/lib/i18n';

import * as React from 'react';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BookingRulesScreen } from '../components/BookingRulesScreen';
import { PaidWhatsAppSettings as WhatsAppSettingsScreen } from '../components/PaidWhatsAppSettings';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  Redirect: () => null,
  useFocusEffect: () => undefined,
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ refetchQueries: jest.fn() }),
}));

let mockRole: 'owner' | 'staff' = 'owner';
jest.mock('@/features/business/me', () => ({
  useMe: () => ({ data: { role: mockRole } }),
  useCanManage: () => mockRole !== 'staff',
}));
jest.mock('@/features/plans/hooks', () => ({
  useEntitlements: () => ({ has: () => false, isLoading: false }),
}));

const mockStart = jest.fn();
const mockSetup = {
  isPending: false,
  isError: false,
  refetch: jest.fn(),
  data: {
    companion_live: true,
    whatsapp: {
      connected: false,
      state: 'not_connected',
      display_phone_number: null as string | null,
    },
  },
};
jest.mock('@/features/companion/hooks', () => ({
  useCompanionSetup: () => mockSetup,
  useConnectWhatsApp: () => ({ start: mockStart }),
}));

const mockSave = jest.fn();
jest.mock('../hooks', () => ({
  useBookingRules: () => ({
    isPending: false,
    isError: false,
    data: {
      lead_time_minutes: 60,
      booking_horizon_days: 60,
      cancellation_window_minutes: 1440,
      slot_interval_minutes: 15,
      buffer_minutes: 0,
      allow_staff_selection: true,
      reminder_offsets_minutes: [1440, 120],
    },
  }),
  useSaveBookingRules: () => ({ mutate: mockSave, isPending: false }),
}));

const METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 402, height: 874 },
};

function mount(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>,
    );
  });
  return tree;
}

function text(tree: ReactTestRenderer): string {
  const parts: string[] = [];
  const visit = (node: ReactTestInstance | string) => {
    if (typeof node === 'string') parts.push(node);
    else node.children.forEach(visit);
  };
  visit(tree.root);
  return parts.join(' | ');
}

const pressable = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll(
    (n) => n.props.accessibilityLabel === label && !!n.props.onPress,
  )[0];

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'owner';
  mockSetup.data.whatsapp = {
    connected: false,
    state: 'not_connected',
    display_phone_number: null,
  };
});

describe('Reminders to clients', () => {
  it('is tappable for the owner, with its value in the label', () => {
    const tree = mount(<WhatsAppSettingsScreen />);
    expect(
      pressable(tree, 'Reminders to clients: 1 day and 2 hours. Change'),
    ).toBeDefined();
  });

  it('is read-only for staff (a value, no press)', () => {
    mockRole = 'staff';
    const tree = mount(<WhatsAppSettingsScreen />);
    expect(
      pressable(tree, 'Reminders to clients: 1 day and 2 hours. Change'),
    ).toBeUndefined();
  });
});

describe('Booking rules', () => {
  it('no longer carries the client reminders', () => {
    const out = text(mount(<BookingRulesScreen />));
    expect(out).toContain('Earliest booking');
    expect(out).not.toContain('Remind clients before');
  });

  it('shows staff every rule read-only instead of only a note', () => {
    mockRole = 'staff';
    const tree = mount(<BookingRulesScreen />);
    const out = text(tree);
    expect(out).toContain('Earliest booking');
    expect(out).toContain('Free cancellation until');
    expect(out).toContain('Only the owner can change this.');
    expect(pressable(tree, 'Earliest booking, 1 hour')).toBeUndefined();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
