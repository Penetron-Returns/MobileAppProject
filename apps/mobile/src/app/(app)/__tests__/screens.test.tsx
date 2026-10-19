import '@/lib/i18n';

import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('@/features/setup-checklist/components/GetSetUpRow', () => ({
  GetSetUpRow: () => null,
}));
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

// Sheets and dialogs portal into a host the test renderer does not have. The
// mocks target the package's own modules, so the design system's OptionSheet
// and the barrel both pick them up.
jest.mock('@booking/ui/components/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}));
jest.mock('@booking/ui/components/Sheet', () => {
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
  canGoBack: jest.fn(() => true),
  setParams: jest.fn(),
};
// `router` is a lazy getter: the factory runs before `mockRouter` is assigned.
jest.mock('expo-router', () =>
  Object.defineProperty(
    {
      ...jest.requireActual('expo-router'),
      useLocalSearchParams: () => mockSearchParams(),
      // No navigator in these tests, so run the focus effect on mount.
      useFocusEffect: (effect: () => void | (() => void)) => {
        const R = jest.requireActual('react');
        R.useEffect(effect, [effect]);
      },
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
  useAvailableDays: mockHook('useAvailableDays'),
  useAppointmentEvents: mockHook('useAppointmentEvents'),
  useBookingRules: mockHook('useBookingRules'),
  usePrefetchAvailability: () => jest.fn(),
  usePrefetchAppointment: () => jest.fn(),
  useRescheduleAppointment: mockMutation,
  useSetAppointmentStatus: mockMutation,
}));
jest.mock('@/features/availability/hooks', () => ({
  useAvailabilityConfig: mockHook('useAvailabilityConfig'),
  useUpcomingWindow: () => ({
    today: '2026-10-12',
    from: '2026-10-12',
    to: '2027-10-12',
    timezone: 'Africa/Johannesburg',
  }),
  useDeleteSpecialDay: mockMutation,
}));
jest.mock('@/features/calendar/hooks', () => ({
  useCalendarDay: mockHook('useCalendarDay'),
  useCalendarWeek: mockHook('useCalendarWeek'),
}));
jest.mock('@/features/clients/hooks', () => ({
  useClientBook: mockHook('useClientBook'),
  useClientSearch: mockHook('useClientSearch'),
  useClient: mockHook('useClient'),
  useClientNotes: mockHook('useClientNotes'),
  useClientAppointments: mockHook('useClientAppointments'),
  useAddClientNote: mockMutation,
  useDeleteClientNote: mockMutation,
  useUpdateClient: mockMutation,
  useClientPreview: () => null,
  usePrefetchClient: () => () => undefined,
}));
jest.mock('@/features/inbox/hooks', () => ({
  useInboxThreads: mockHook('useInboxThreads'),
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

// One range per weekday (a lunch gap is a staff break); Sunday is closed.
const HOURS = [1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  opens_at: '09:00:00',
  closes_at: '18:00:00',
}));

const NOW_MS = Date.parse('2026-10-12T12:00:00.000Z');

const CLIENT_ROWS = [
  {
    id: 'c-1',
    name: 'Olivia Bennett',
    phone_e164: '+27821234567',
    tags: ['VIP'],
    last_seen_at: null,
    appointments: [
      {
        starts_at: '2026-09-01T08:00:00.000Z',
        created_at: '2026-08-20T08:00:00.000Z',
        status: 'completed',
        service: { name: 'Balayage' },
      },
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
  service_id: 'sv-1',
  staff_id: 's-1',
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

function STAFF_FIRST() {
  return STAFF[0];
}

const DAY_VIEW = {
  status: 'ready',
  timezone: 'Africa/Johannesburg',
  today: '2026-10-12',
  now: new Date('2026-10-12T08:40:00.000Z'),
  columns: [
    {
      staff: STAFF_FIRST(),
      working: [{ startMin: 540, endMin: 1080 }],
      blocks: [{ startMin: 780, endMin: 840, kind: 'break', label: 'Lunch' }],
      appointments: APPOINTMENTS,
    },
  ],
  window: { startMin: 540, endMin: 1080 },
  closedDay: null,
  isOffline: false,
  refresh: jest.fn(),
};
const WEEK_VIEW = {
  status: 'ready',
  timezone: 'Africa/Johannesburg',
  today: '2026-10-12',
  now: new Date('2026-10-12T08:40:00.000Z'),
  schedule: {
    hours: HOURS,
    specialDays: [],
    rules: [],
    overrides: [],
    breaks: [],
    timeOff: [],
  },
  appointments: APPOINTMENTS,
  staff: [],
  isOffline: false,
  refresh: jest.fn(),
};

afterEach(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  // Pin the clock to the fixtures' Monday so week boundaries never drift.
  jest.useFakeTimers({ now: NOW_MS, doNotFake: ['nextTick', 'setImmediate'] });
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
      plan: 'growth',
      features: [{ feature: 'companion', monthly_limit: null }],
    }),
    useDashboardSummary: success(SUMMARY),
    useDaySchedule: success(SCHEDULE),
    useAppointmentsBetween: success(APPOINTMENTS),
    useAppointment: success(APPOINTMENT_DETAIL),
    useAvailableSlots: { ...success(undefined), isPending: true },
    useClientBook: { ...success(CLIENT_ROWS), dataUpdatedAt: NOW_MS },
    useInboxThreads: success([]),
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
    useAvailableDays: { ...success(undefined), isPending: true },
    useAppointmentEvents: success([
      { id: 'e-1', type: 'created', occurred_at: '2026-10-01T08:00:00.000Z' },
    ]),
    useBookingRules: success({ cancellation_window_minutes: 1440 }),
    useAvailabilityConfig: success({
      from: '2026-10-12',
      to: '2027-10-12',
      timezone: 'Africa/Johannesburg',
      business_hours: [],
      special_days: [],
      staff: [],
    }),
    useCalendarDay: DAY_VIEW,
    useCalendarWeek: WEEK_VIEW,
  };
  for (const [name, value] of Object.entries(defaults)) {
    mockHooks[name] = jest.fn(() => value);
  }
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setCalendarViewMode } from '@/features/calendar/navigation';

import NewBookingRoute from '../new-booking';
import BookingDetailRoute from '../bookings/[id]';
import CalendarRoute from '../(tabs)/calendar';
import CancelRoute from '../bookings/cancel/[id]';
import RescheduleRoute from '../bookings/reschedule/[id]';
import ClientsRoute from '../(tabs)/clients';
import ClientProfileRoute from '../clients/[id]';
import SettingsRoute from '../(tabs)/settings';
import BusinessDetailsRoute from '../settings/business-details';
import OperatingHoursRoute from '../settings/operating-hours';
import ServicesRoute from '../settings/services';

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

/** Serialises the tree, skipping props that hold React elements (circular). */
function toJson(tree: renderer.ReactTestRenderer) {
  return JSON.stringify(tree.toJSON(), (key, value) =>
    key === 'refreshControl' ||
    key === 'ListHeaderComponent' ||
    key === 'ListEmptyComponent'
      ? undefined
      : value,
  );
}

const render = (ui: React.ReactElement) => toJson(renderScreen(ui));

describe('Calendar', () => {
  it('renders the day grid with staff column, booking and off-hours state', () => {
    const json = render(<CalendarRoute />);
    expect(json).toContain('Emma Thompson');
    expect(json).toContain('1 booking');
    expect(json).toContain('Olivia Bennett');
    expect(json).toContain('Balayage & Toner');
    // The staff break is drawn on the column, labelled as on the board.
    expect(json).toContain('Lunch · 13:00');
  });

  it('switches to the read-only week list and back via setCalendarViewMode', () => {
    const tree = renderScreen(<CalendarRoute />);
    act(() =>
      tree.root
        .findByProps({ accessibilityLabel: 'Week view' })
        .props.onPress(),
    );
    expect(toJson(tree)).toContain('1 booking this week');
    act(() => setCalendarViewMode('day'));
    expect(toJson(tree)).toContain('Olivia Bennett');
  });

  it('shows a retry card when the day fails to load', () => {
    mockHooks.useCalendarDay.mockReturnValue({
      status: 'error',
      error: new Error('down'),
      retry: jest.fn(),
    });
    expect(render(<CalendarRoute />)).toContain("Couldn't load the calendar");
  });
});

describe('Clients', () => {
  it('lists clients in A-Z groups with VIP, last service and an index', () => {
    const json = render(<ClientsRoute />);
    expect(json).toContain('Olivia Bennett');
    expect(json).toContain('James Wilson');
    expect(json).toContain('Balayage · 1 Sep');
    expect(json).toContain('VIP');
    expect(json).toContain('No visits yet');
    expect(json).toContain('Jump to J');
  });

  it('shows an empty state when there are no clients yet', () => {
    mockHooks.useClientBook.mockReturnValue({
      ...success([]),
      dataUpdatedAt: NOW_MS,
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
  it('shows service, time, client, actions and the cancel link', () => {
    mockSearchParams.mockReturnValue({ id: 'a-1' });
    const json = render(<BookingDetailRoute />);
    expect(json).toContain('Balayage & Toner');
    expect(json).toContain('14:00 to 17:00');
    expect(json).toContain('Olivia Bennett');
    expect(json).toContain('Check in');
    expect(json).toContain('Message');
    expect(json).toContain('Reschedule');
    expect(json).toContain('R 2,200.00');
    expect(json).toContain('Cancel booking');
    expect(json).not.toContain('No-show');
  });

  it('shows not-found for a missing booking', () => {
    mockSearchParams.mockReturnValue({ id: 'missing' });
    mockHooks.useAppointment.mockReturnValue(success(null));
    expect(render(<BookingDetailRoute />)).toContain(
      "This booking couldn't be found.",
    );
  });
});

describe('Reschedule', () => {
  it('shows the current time and a disabled move button until a time is chosen', () => {
    mockSearchParams.mockReturnValue({ id: 'a-1' });
    const json = render(<RescheduleRoute />);
    expect(json).toContain('is the current time');
    expect(json).toContain('Pick a new time');
    expect(json).toContain('Tell Olivia Bennett on WhatsApp');
  });
});

describe('Cancel booking', () => {
  it('offers the reasons and the WhatsApp toggle', () => {
    mockSearchParams.mockReturnValue({ id: 'a-1' });
    const json = render(<CancelRoute />);
    expect(json).toContain('Why is this being cancelled?');
    expect(json).toContain('Client asked');
    expect(json).toContain('Staff unavailable');
    expect(json).toContain('Tell Olivia Bennett on WhatsApp');
  });
});

describe('New booking', () => {
  it('starts with the client search, new client row and the service list', () => {
    const json = render(<NewBookingRoute />);
    expect(json).toContain('Who is it for?');
    expect(json).toContain('Olivia Bennett');
    expect(json).toContain('New client');
    expect(json).toContain("Women's Haircut");
    expect(json).not.toContain('Retired Treatment');
    expect(json).toContain('Next: pick a time');
  });

  it('shows the done state, and Done closes the sheet', () => {
    let onSuccess: ((id: string) => void) | undefined;
    mockHooks.useCreateAppointment.mockImplementation(
      (opts: { onSuccess: (id: string) => void }) => {
        onSuccess = opts.onSuccess;
        return mockMutation();
      },
    );
    const tree = renderScreen(<NewBookingRoute />);
    act(() =>
      tree.root
        .findByProps({ accessibilityLabel: "Women's Haircut" })
        .props.onPress(),
    );
    act(() =>
      tree.root
        .findByProps({ accessibilityLabel: 'Pick Olivia Bennett' })
        .props.onPress(),
    );
    act(() =>
      tree.root
        .findByProps({ accessibilityLabel: 'Next: pick a time' })
        .props.onPress(),
    );
    expect(toJson(tree)).toContain('When?');
    act(() => onSuccess?.('appt-9'));
    expect(toJson(tree)).toContain('Booked');
    act(() =>
      tree.root.findByProps({ accessibilityLabel: 'Done' }).props.onPress(),
    );
    expect(mockRouter.back).toHaveBeenCalled();
  });
});

describe('Settings', () => {
  it('shows the profile, role and settings links', () => {
    const json = render(<SettingsRoute />);
    expect(json).toContain('Ashgrove Hair & Beauty');
    expect(json).toContain('Owner');
    expect(json).toContain('Opening hours');
    expect(json).toContain('Team');
    expect(json).toContain('Booking rules');
    expect(json).toContain('WhatsApp');
    expect(json).toContain('Sign out');
  });

  it('prefills business details from the database', () => {
    const json = render(<BusinessDetailsRoute />);
    expect(json).toContain('Ashgrove');
    expect(json).toContain('hello@ashgrove.example');
    expect(json).toContain('14 Ashgrove Lane');
    expect(json).toContain('South African Rand (ZAR)');
  });

  it('shows one range per weekday, Sunday closed and the special days entry', () => {
    const json = render(<OperatingHoursRoute />);
    expect(json).toContain('Monday');
    expect(json).toContain('09:00');
    expect(json).toContain('18:00');
    expect(json).toContain('Closed');
    expect(json).toContain('Holidays and special days');
  });

  it('links to breaks and time off in Team', () => {
    const tree = renderScreen(<OperatingHoursRoute />);
    expect(toJson(tree)).toContain(
      'Breaks and time off are set per person in Team.',
    );
    act(() =>
      tree.root
        .findByProps({
          accessibilityLabel: 'Open Team',
        })
        .props.onPress(),
    );
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/team');
  });

  it('groups services by category with prices and hidden markers', () => {
    const json = render(<ServicesRoute />);
    expect(json).toContain('Hair');
    expect(json).toContain('Nails');
    expect(json).toContain("Women's Haircut");
    expect(json).toContain('R850');
    expect(json).toContain('Hidden');
  });
});

describe('Offline and error states', () => {
  beforeEach(() => mockSearchParams.mockReturnValue({ id: 'a-1' }));

  it('shows the error banner with the reason when a booking fails to load', () => {
    mockHooks.useAppointment.mockReturnValue(failure(new Error('boom')));
    const json = render(<BookingDetailRoute />);
    expect(json).toContain('boom');
    expect(json).toContain('Try again');
  });

  it('says the device is offline instead of loading forever on a paused first load', () => {
    mockHooks.useAppointment.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      isSuccess: false,
      error: null,
      fetchStatus: 'paused',
      dataUpdatedAt: 0,
      refetch: jest.fn(),
    });
    const json = render(<BookingDetailRoute />);
    expect(json).toContain("You're offline. Reconnect to make changes.");
  });

  it('keeps the booking and adds the saved-copy banner when a refresh is paused', () => {
    mockHooks.useAppointment.mockReturnValue({
      ...success(APPOINTMENT_DETAIL),
      fetchStatus: 'paused',
      dataUpdatedAt: Date.parse('2026-10-13T08:00:00.000Z'),
    });
    const json = render(<BookingDetailRoute />);
    expect(json).toContain('Offline · showing what we had at');
    expect(json).toContain('Olivia Bennett');
  });
});
