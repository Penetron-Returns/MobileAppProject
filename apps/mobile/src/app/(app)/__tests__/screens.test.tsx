import '@/lib/i18n';

import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@clerk/expo', () => ({
  useClerk: () => ({ signOut: jest.fn() }),
  useUser: () => ({
    user: {
      fullName: 'Kobus Krieg',
      primaryEmailAddress: { emailAddress: 'kobus@example.com' },
      imageUrl: null,
    },
  }),
  useOrganization: () => ({ organization: { name: 'Ashgrove Hair & Beauty' } }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));

// Reanimated (used by the sheet's animations) can't load under Jest.
jest.mock('@/components/Sheet', () => {
  const { View } = require('react-native');
  const Passthrough = ({ children }: { children?: unknown }) =>
    children ?? null;
  return {
    Sheet: ({ open, children }: { open: boolean; children?: unknown }) =>
      open ? children : null,
    SheetContent: Passthrough,
    SheetHeader: View,
    SheetTitle: View,
    SheetDescription: View,
  };
});

const mockSearchParams = jest.fn();
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  setParams: jest.fn(),
};
// `router` is a lazy getter: the factory runs before `mockRouter` is assigned.
jest.mock('expo-router', () =>
  Object.defineProperty(
    {
      ...jest.requireActual('expo-router'),
      useLocalSearchParams: () => mockSearchParams(),
      useRouter: () => ({
        push: jest.fn(),
        replace: jest.fn(),
        back: jest.fn(),
      }),
    },
    'router',
    { get: () => mockRouter, enumerable: true },
  ),
);

// Mock factories run before this file's consts initialise, so they only
// capture hoisted functions that read `mockHooks` lazily at call time.
const mockHooks: Record<string, jest.Mock> = {};
function mockHook(name: string) {
  return (...args: unknown[]) => mockHooks[name](...args);
}
function mockMutation() {
  return { mutate: jest.fn(), isPending: false };
}

jest.mock('@/features/business/hooks', () => ({
  useBusiness: mockHook('useBusiness'),
  useBusinessDetails: mockHook('useBusinessDetails'),
  useBusinessHours: mockHook('useBusinessHours'),
  useWhatsAppAccount: mockHook('useWhatsAppAccount'),
  useUpdateBusiness: mockMutation,
  useReplaceBusinessHours: mockMutation,
}));
jest.mock('@/features/business/me', () => ({
  useMe: mockHook('useMe'),
  useCanManage: () => true,
}));
jest.mock('@/features/dashboard/hooks', () => ({
  useDashboardSummary: mockHook('useDashboardSummary'),
  useDaySchedule: mockHook('useDaySchedule'),
}));
jest.mock('@/features/appointments/hooks', () => ({
  useAppointmentsBetween: mockHook('useAppointmentsBetween'),
  useAppointment: mockHook('useAppointment'),
  useAvailableSlots: mockHook('useAvailableSlots'),
  useCheckInAppointment: mockMutation,
  useCancelAppointment: mockMutation,
  useCreateAppointment: mockHook('useCreateAppointment'),
}));
jest.mock('@/features/clients/hooks', () => ({
  useClientList: mockHook('useClientList'),
  useClientSearch: mockHook('useClientSearch'),
  useClient: mockHook('useClient'),
  useClientNotes: mockHook('useClientNotes'),
  useClientAppointments: mockHook('useClientAppointments'),
  useAddClientNote: mockMutation,
  useDeleteClientNote: mockMutation,
  useUpdateClient: mockMutation,
}));
jest.mock('@/features/catalog/hooks', () => ({
  useServices: mockHook('useServices'),
  useStaff: mockHook('useStaff'),
  useStaffServices: mockHook('useStaffServices'),
  useSaveService: mockMutation,
  useDeleteService: mockMutation,
  useSaveStaff: mockMutation,
  useDeleteStaff: mockMutation,
}));

function success<T>(data: T) {
  return {
    data,
    isPending: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: jest.fn(),
  };
}
function failure(error: Error) {
  return {
    data: undefined,
    isPending: false,
    isError: true,
    isSuccess: false,
    error,
    refetch: jest.fn(),
  };
}

const BUSINESS = {
  id: 'biz-1',
  name: 'Ashgrove',
  timezone: 'Africa/Johannesburg',
  currency: 'ZAR',
};

const SCHEDULE = [
  {
    id: 'appt-1',
    starts_at: '2026-10-12T07:00:00.000Z',
    duration_minutes: 60,
    status: 'completed',
    checked_in_at: '2026-10-12T06:55:00.000Z',
    client: { name: 'Emma Thompson', phone_e164: '+27825550100' },
    service: { name: 'Signature Facial' },
  },
  {
    id: 'appt-2',
    starts_at: '2026-10-12T08:30:00.000Z',
    duration_minutes: 60,
    status: 'confirmed',
    checked_in_at: null,
    client: { name: 'Sarah Jenkins', phone_e164: '+27825550101' },
    service: { name: 'Deep Tissue Massage' },
  },
];

const SUMMARY = {
  month_revenue_cents: 1245000,
  revenue_by_day: [
    { date: '2026-10-01', cents: 0 },
    { date: '2026-10-02', cents: 85000 },
  ],
  today: {
    total: 2,
    confirmed: 1,
    completed: 1,
    cancelled: 0,
    no_show: 0,
    checked_in: 1,
  },
  next_appointment_id: 'appt-2',
};

const APPOINTMENTS = [
  {
    id: 'a-1',
    starts_at: '2026-10-12T07:00:00.000Z',
    ends_at: '2026-10-12T08:00:00.000Z',
    duration_minutes: 60,
    status: 'confirmed',
    checked_in_at: null,
    client: { id: 'c-1', name: 'Olivia Bennett' },
    service: { name: 'Balayage & Toner' },
    staff: { id: 's-1', name: 'Emma Thompson' },
  },
];

const HOURS = [1, 2, 3, 4, 5, 6, 0].flatMap((weekday) =>
  weekday === 0
    ? []
    : [
        { weekday, opens_at: '09:00:00', closes_at: '13:00:00' },
        { weekday, opens_at: '14:00:00', closes_at: '18:00:00' },
      ],
);

const CLIENT_ROWS = [
  {
    id: 'c-1',
    name: 'Olivia Bennett',
    phone_e164: '+27821234567',
    tags: ['VIP'],
    last_seen_at: null,
    appointments: [
      { starts_at: '2026-09-01T08:00:00.000Z', status: 'completed' },
    ],
  },
  {
    id: 'c-2',
    name: 'James Wilson',
    phone_e164: '+27831112222',
    tags: [],
    last_seen_at: null,
    appointments: [],
  },
];

const CLIENT = {
  id: 'c-1',
  name: 'Olivia Bennett',
  phone_e164: '+27821234567',
  email: 'olivia@example.com',
  tags: ['VIP'],
  first_seen_at: '2025-09-01T08:00:00.000Z',
  is_blocked: false,
};

const CLIENT_HISTORY = [
  {
    id: 'h-1',
    starts_at: '2026-09-01T08:00:00.000Z',
    duration_minutes: 180,
    status: 'completed',
    price_cents: 220000,
    service: { name: 'Balayage & Toner' },
    staff: { name: 'Emma Thompson' },
  },
  {
    id: 'h-2',
    starts_at: '2026-08-01T08:00:00.000Z',
    duration_minutes: 60,
    status: 'cancelled',
    price_cents: 85000,
    service: { name: "Women's Haircut" },
    staff: { name: 'Marcus Chen' },
  },
];

const APPOINTMENT_DETAIL = {
  id: 'a-1',
  client_id: 'c-1',
  starts_at: '2026-10-13T12:00:00.000Z',
  ends_at: '2026-10-13T15:00:00.000Z',
  duration_minutes: 180,
  status: 'confirmed',
  source: 'whatsapp',
  price_cents: 220000,
  notes: 'Patch test done.',
  checked_in_at: null,
  created_at: '2026-10-01T08:00:00.000Z',
  client: {
    id: 'c-1',
    name: 'Olivia Bennett',
    phone_e164: '+27821234567',
    tags: ['VIP'],
  },
  service: { name: 'Balayage & Toner', category: 'Hair' },
  staff: { name: 'Emma Thompson', photo_url: null },
};

const SERVICES = [
  {
    id: 'sv-1',
    name: "Women's Haircut",
    description: null,
    category: 'Hair',
    duration_minutes: 60,
    price_cents: 85000,
    deposit_cents: 0,
    is_active: true,
    sort_order: 10,
  },
  {
    id: 'sv-2',
    name: 'Gel Manicure',
    description: null,
    category: 'Nails',
    duration_minutes: 45,
    price_cents: 35000,
    deposit_cents: 0,
    is_active: true,
    sort_order: 20,
  },
  {
    id: 'sv-3',
    name: 'Retired Treatment',
    description: null,
    category: 'Nails',
    duration_minutes: 30,
    price_cents: 10000,
    deposit_cents: 0,
    is_active: false,
    sort_order: 30,
  },
];

const STAFF = [
  {
    id: 's-1',
    user_id: null,
    name: 'Emma Thompson',
    title: 'Senior Colourist',
    photo_url: null,
    phone: null,
    email: null,
    color: null,
    is_active: true,
    accepts_bookings: true,
    sort_order: 10,
  },
  {
    id: 's-2',
    user_id: null,
    name: 'Marcus Chen',
    title: 'Stylist',
    photo_url: null,
    phone: null,
    email: null,
    color: null,
    is_active: false,
    accepts_bookings: false,
    sort_order: 20,
  },
];

beforeEach(() => {
  mockSearchParams.mockReturnValue({});
  const defaults: Record<string, unknown> = {
    useBusiness: success(BUSINESS),
    useBusinessDetails: success({
      ...BUSINESS,
      email: 'hello@ashgrove.example',
      phone: '+27215550199',
      address: '14 Ashgrove Lane',
      logo_url: null,
    }),
    useBusinessHours: success(HOURS),
    useWhatsAppAccount: success({
      status: 'live',
      display_phone: '+27215550199',
      verified_name: 'Ashgrove',
    }),
    useMe: success({
      role: 'owner',
      plan: 'free',
      features: [{ feature: 'whatsapp_menu', monthly_limit: null }],
    }),
    useDashboardSummary: success(SUMMARY),
    useDaySchedule: success(SCHEDULE),
    useAppointmentsBetween: success(APPOINTMENTS),
    useAppointment: success(APPOINTMENT_DETAIL),
    useAvailableSlots: { ...success(undefined), isPending: true },
    useClientList: {
      ...success({ pages: [CLIENT_ROWS] }),
      hasNextPage: true,
      fetchNextPage: jest.fn(),
    },
    useClientSearch: success(CLIENT_ROWS),
    useClient: success(CLIENT),
    useClientNotes: success([
      {
        id: 'n-1',
        body: 'Allergic to PPD.',
        kind: 'warning',
        created_at: '2026-01-01T00:00:00Z',
      },
    ]),
    useClientAppointments: success(CLIENT_HISTORY),
    useServices: success(SERVICES),
    useStaff: success(STAFF),
    useStaffServices: success([{ staff_id: 's-1', service_id: 'sv-1' }]),
    useCreateAppointment: mockMutation(),
  };
  for (const [name, value] of Object.entries(defaults)) {
    mockHooks[name] = jest.fn(() => value);
  }
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setCalendarViewMode } from '@/features/calendar/navigation';

import AddBookingRoute from '../add';
import BookingDetailRoute from '../bookings/[id]';
import CalendarRoute from '../calendar';
import ClientsRoute from '../clients';
import ClientProfileRoute from '../clients/[id]';
import SettingsRoute from '../settings';
import BusinessDetailsRoute from '../settings/business-details';
import OperatingHoursRoute from '../settings/operating-hours';
import ServicesRoute from '../settings/services';
import StaffManagementRoute from '../settings/staff-management';

const initialMetrics = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 375, height: 812 },
};

function renderScreen(ui: React.ReactElement) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <QueryClientProvider client={new QueryClient()}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          {ui}
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
  });
  return tree;
}

/** Serialises the tree, skipping `refreshControl` (a circular React element). */
function toJson(tree: renderer.ReactTestRenderer) {
  return JSON.stringify(tree.toJSON(), (key, value) =>
    key === 'refreshControl' ? undefined : value,
  );
}

const render = (ui: React.ReactElement) => toJson(renderScreen(ui));

describe('Calendar', () => {
  it('renders the day timeline with bookings and the lunch break from split shifts', () => {
    const json = render(<CalendarRoute />);
    expect(json).toContain('Balayage & Toner');
    expect(json).toContain('Olivia Bennett · Emma Thompson');
    expect(json).toContain('09:00 - 10:00');
    expect(json).toContain('Break');
  });

  it('switches between week and month views and back to today via setCalendarViewMode', () => {
    const tree = renderScreen(<CalendarRoute />);
    act(() =>
      tree.root
        .findByProps({ accessibilityLabel: 'Week view' })
        .props.onPress(),
    );
    expect(toJson(tree)).toContain('Week view');
    expect(toJson(tree)).toContain('1 appt');
    act(() =>
      tree.root
        .findByProps({ accessibilityLabel: 'Month view' })
        .props.onPress(),
    );
    expect(toJson(tree)).toContain('Month view');
    act(() => setCalendarViewMode('day'));
    expect(toJson(tree)).toContain('Break');
  });

  it('shows an error when appointments fail to load', () => {
    mockHooks.useAppointmentsBetween.mockReturnValue(
      failure(new Error('down')),
    );
    expect(render(<CalendarRoute />)).toContain("Couldn't load this.");
  });
});

describe('Clients', () => {
  it('lists clients with VIP badges, last visit and paging', () => {
    const json = render(<ClientsRoute />);
    expect(json).toContain('Olivia Bennett');
    expect(json).toContain('James Wilson');
    expect(json).toContain('VIP');
    expect(json).toContain('No visits yet');
    expect(json).toContain('Show more clients');
  });

  it('shows an empty state when no clients match', () => {
    mockHooks.useClientList.mockReturnValue({
      ...success({ pages: [[]] }),
      hasNextPage: false,
    });
    expect(render(<ClientsRoute />)).toContain('No clients yet');
  });

  it('renders a client profile with contact, notes, stats and history', () => {
    mockSearchParams.mockReturnValue({ id: 'c-1' });
    const json = render(<ClientProfileRoute />);
    expect(json).toContain('Olivia Bennett');
    expect(json).toContain('+27 82 123 4567');
    expect(json).toContain('olivia@example.com');
    expect(json).toContain('Allergic to PPD.');
    expect(json).toContain('1 visit');
    expect(json).toContain('2,200 spent');
    expect(json).toContain("Women's Haircut");
  });
});

describe('Booking detail', () => {
  it('shows the client, schedule, service, staff and a cancel action', () => {
    mockSearchParams.mockReturnValue({ id: 'a-1' });
    const json = render(<BookingDetailRoute />);
    expect(json).toContain('Booking Detail');
    expect(json).toContain('Olivia Bennett');
    expect(json).toContain('VIP client • 1 past visit');
    expect(json).toContain('14:00 - 17:00');
    expect(json).toContain('Balayage & Toner');
    expect(json).toContain('R 2,200.00');
    expect(json).toContain('Emma Thompson');
    expect(json).toContain('Patch test done.');
    expect(json).toContain('Cancel');
  });

  it('shows not-found for a missing booking', () => {
    mockSearchParams.mockReturnValue({ id: 'missing' });
    mockHooks.useAppointment.mockReturnValue(success(null));
    expect(render(<BookingDetailRoute />)).toContain(
      "This booking couldn't be found.",
    );
  });
});

describe('Add booking', () => {
  it('renders the client, service, staff, date and confirmation sections', () => {
    const json = render(<AddBookingRoute />);
    expect(json).toContain('Existing');
    expect(json).toContain('New Client');
    expect(json).toContain('Olivia Bennett');
    expect(json).toContain('Select a service');
    expect(json).toContain('No preference');
    expect(json).toContain('Choose a service to see available times.');
    expect(json).toContain('Send WhatsApp confirmation');
    expect(json).toContain('Save Booking');
  });

  it('clears the form and the client preselection after a booking is saved', () => {
    let onSuccess: ((id: string) => void) | undefined;
    mockHooks.useCreateAppointment.mockImplementation(
      (opts: { onSuccess: (id: string) => void }) => {
        onSuccess = opts.onSuccess;
        return mockMutation();
      },
    );
    const tree = renderScreen(<AddBookingRoute />);
    const notes = () =>
      tree.root.findAllByProps({
        placeholder: 'Special requests, allergies or notes for the staff...',
      })[0];

    act(() => notes().props.onChangeText('Allergic to latex'));
    expect(notes().props.value).toBe('Allergic to latex');

    act(() => onSuccess?.('appt-9'));
    expect(notes().props.value).toBe('');
    expect(mockRouter.setParams).toHaveBeenCalledWith({
      clientId: '',
      mode: '',
    });
    expect(mockRouter.push).toHaveBeenCalledWith('/bookings/appt-9');
  });
});

describe('Settings', () => {
  it('shows the profile, role, settings links and WhatsApp status', () => {
    const json = render(<SettingsRoute />);
    expect(json).toContain('Ashgrove Hair & Beauty');
    expect(json).toContain('Owner');
    expect(json).toContain('Hours');
    expect(json).toContain('Team');
    expect(json).toContain('Booking rules');
    expect(json).toContain('Connected · +27 21 555 0199');
    expect(json).toContain('Sign out');
  });

  it('prefills business details from the database', () => {
    const json = render(<BusinessDetailsRoute />);
    expect(json).toContain('Ashgrove');
    expect(json).toContain('hello@ashgrove.example');
    expect(json).toContain('14 Ashgrove Lane');
    expect(json).toContain('South African Rand (ZAR)');
  });

  it('shows split shifts per weekday and Sunday closed', () => {
    const json = render(<OperatingHoursRoute />);
    expect(json).toContain('Monday');
    expect(json).toContain('09:00 AM');
    expect(json).toContain('01:00 PM');
    expect(json).toContain('02:00 PM');
    expect(json).toContain('No hours set');
  });

  it('groups services by category with prices and hidden markers', () => {
    const json = render(<ServicesRoute />);
    expect(json).toContain('Hair');
    expect(json).toContain('Nails');
    expect(json).toContain("Women's Haircut");
    expect(json).toContain('R 850.00');
    expect(json).toContain('Hidden');
  });

  it('lists staff with titles and status', () => {
    const json = render(<StaffManagementRoute />);
    expect(json).toContain('Emma Thompson');
    expect(json).toContain('Senior Colourist');
    expect(json).toContain('Active');
    expect(json).toContain('Inactive');
  });
});
