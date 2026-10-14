import '@/lib/i18n';

import * as React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act } from 'react-test-renderer';

import type { TodayView } from '../hooks';
import type { TodayAppointment } from '../logic';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

const mockCheckIn = jest.fn();
jest.mock('@/features/appointments/hooks', () => ({
  useCheckInAppointment: () => ({ mutate: mockCheckIn, isPending: false }),
}));

let mockView: TodayView = { status: 'loading' };
let mockLink: string | null = null;
jest.mock('../hooks', () => ({
  useToday: () => mockView,
  useBookingLink: () => mockLink,
}));

import { TodayScreen } from '../components/TodayScreen';

const NOW = new Date('2026-10-14T08:40:00.000Z'); // 10:40 in Johannesburg

function appt(
  id: string,
  startsAt: string,
  overrides: Partial<TodayAppointment> = {},
): TodayAppointment {
  return {
    id,
    starts_at: startsAt,
    ends_at: new Date(new Date(startsAt).getTime() + 3_600_000).toISOString(),
    duration_minutes: 60,
    status: 'confirmed',
    checked_in_at: null,
    price_cents: 50_000,
    client: { name: `Client ${id}`, phone_e164: '+27825550100' },
    service: { name: 'Silk press' },
    staff: { name: 'Thandi' },
    ...overrides,
  };
}

function ready(
  appointments: TodayAppointment[],
  overrides: Partial<Extract<TodayView, { status: 'ready' }>> = {},
): TodayView {
  const [upNext, ...rest] = appointments;
  return {
    status: 'ready',
    caption: 'Wednesday 14 October',
    currency: 'ZAR',
    timezone: 'Africa/Johannesburg',
    now: NOW,
    appointments,
    upNext: upNext ?? null,
    later: { rows: rest, hiddenCount: 0 },
    expectedCents: appointments.length * 50_000,
    isOffline: false,
    lastUpdated: '10:32',
    refresh: jest.fn(),
    ...overrides,
  };
}

function render() {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider
        initialMetrics={{
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
          frame: { x: 0, y: 0, width: 375, height: 812 },
        }}
      >
        <TodayScreen />
      </SafeAreaProvider>,
    );
  });
  // `refreshControl` is a circular React element, so skip it.
  return JSON.stringify(tree.toJSON(), (key, value) =>
    key === 'refreshControl' ? undefined : value,
  );
}

beforeEach(() => {
  mockView = { status: 'loading' };
  mockLink = null;
  mockCheckIn.mockClear();
});

describe('TodayScreen', () => {
  it('shows a busy skeleton while loading', () => {
    const json = render();
    expect(json).toContain('Today');
    expect(json).toContain('Loading today');
  });

  it('shows what failed, the request id and a retry on error', () => {
    mockView = { status: 'error', error: new Error('boom'), retry: jest.fn() };
    const json = render();
    expect(json).toContain("Couldn't load today");
    expect(json).toContain('Try again');
  });

  it('shows the empty state with the booking link when nothing is booked', () => {
    mockView = ready([]);
    mockLink = 'wa.me/27115550198';
    const json = render();
    expect(json).toContain('No bookings today');
    expect(json).toContain('wa.me/27115550198');
    expect(json).toContain('Copy link');
    expect(json).toContain('Add a booking');
    expect(json).not.toContain('expected today');
  });

  it('omits the link row when WhatsApp is not connected', () => {
    mockView = ready([]);
    expect(render()).not.toContain('Copy link');
  });

  it('shows the up-next hero with time, service, staff and actions', () => {
    mockView = ready([appt('a', '2026-10-14T09:00:00.000Z')]);
    const json = render();
    expect(json).toContain('Wednesday 14 October');
    expect(json).toContain('Up next');
    expect(json).toContain('Client a');
    expect(json).toContain('Silk press with Thandi');
    expect(json).toContain('11:00 · in 20m');
    expect(json).toContain('Check in');
    expect(json).toContain('Message');
  });

  it('lists later bookings and the expected total in business currency', () => {
    mockView = ready([
      appt('a', '2026-10-14T09:00:00.000Z'),
      appt('b', '2026-10-14T10:30:00.000Z'),
    ]);
    const json = render();
    expect(json).toContain('Later today');
    expect(json).toContain('Client b');
    expect(json).toContain('12:30');
    expect(json).toContain('R 1,000 expected today');
  });

  it('counts the hidden bookings in the see-all link', () => {
    mockView = ready(
      [
        appt('a', '2026-10-14T09:00:00.000Z'),
        appt('b', '2026-10-14T10:30:00.000Z'),
      ],
      {
        later: {
          rows: [appt('b', '2026-10-14T10:30:00.000Z')],
          hiddenCount: 14,
        },
      },
    );
    expect(render()).toContain('See all 14 more');
  });

  it('flags a booking that needs confirming', () => {
    mockView = ready([
      appt('a', '2026-10-14T09:00:00.000Z'),
      appt('b', '2026-10-14T10:30:00.000Z', { status: 'pending' as never }),
    ]);
    expect(render()).toContain('Needs confirming');
  });

  it('replaces Check in with an Arrived state once checked in', () => {
    mockView = ready([
      appt('a', '2026-10-14T09:00:00.000Z', {
        checked_in_at: '2026-10-14T08:35:00.000Z',
      }),
    ]);
    const json = render();
    expect(json).toContain('Arrived');
    expect(json).toContain('Checked in');
    expect(json).not.toContain('"Check in"');
  });

  it('shows the done message when nothing is left today', () => {
    mockView = ready(
      [appt('a', '2026-10-14T06:00:00.000Z', { status: 'completed' })],
      {
        upNext: null,
        later: { rows: [], hiddenCount: 0 },
      },
    );
    const json = render();
    expect(json).toContain('Nothing else today');
    expect(json).toContain('R 500 expected today');
  });

  it('shows the offline banner with the time of the saved copy', () => {
    mockView = ready([appt('a', '2026-10-14T09:00:00.000Z')], {
      isOffline: true,
    });
    expect(render()).toContain('Offline · showing what we had at 10:32');
  });

  it('hides the offline banner when online', () => {
    mockView = ready([appt('a', '2026-10-14T09:00:00.000Z')]);
    expect(render()).not.toContain('Offline');
  });
});
