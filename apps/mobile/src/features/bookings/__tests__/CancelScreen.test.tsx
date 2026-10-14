import '@/lib/i18n';

import * as React from 'react';
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CancelScreen } from '../components/CancelScreen';

const mockAppointment = jest.fn();
const mockCancelMutate = jest.fn();
let mockOnCancelled: (() => void) | undefined;

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/bookings/cancel/a-1',
  router: { replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));
jest.mock('@/features/business/hooks', () => ({
  useBusiness: () => ({
    data: { id: 'b-1', timezone: 'Africa/Johannesburg', currency: 'ZAR' },
    isPending: false,
    isError: false,
  }),
}));
jest.mock('@/features/appointments/hooks', () => ({
  useAppointment: () => mockAppointment(),
  useBookingRules: () => ({ data: { cancellation_window_minutes: 1440 } }),
  useCancelAppointment: (opts: { onSuccess?: () => void }) => {
    mockOnCancelled = opts.onSuccess;
    return { mutate: mockCancelMutate, isPending: false };
  },
}));

const detail = (status: string) => ({
  data: {
    id: 'a-1',
    status,
    starts_at: '2026-10-13T12:00:00.000Z',
    client: { id: 'c-1', name: 'Olivia Bennett', phone_e164: '+27821234567' },
    service: { name: 'Balayage & Toner' },
  },
  isPending: false,
  isError: false,
  error: null,
  refetch: jest.fn(),
});

const metrics = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 375, height: 812 },
};

function mount() {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <CancelScreen appointmentId="a-1" />
      </SafeAreaProvider>,
    );
  });
  return tree;
}
const rerender = (tree: renderer.ReactTestRenderer) =>
  act(() =>
    tree.update(
      <SafeAreaProvider initialMetrics={metrics}>
        <CancelScreen appointmentId="a-1" />
      </SafeAreaProvider>,
    ),
  );
const text = (tree: renderer.ReactTestRenderer) =>
  JSON.stringify(tree.toJSON(), (k, v) =>
    k === 'refreshControl' ? undefined : v,
  );

beforeEach(() => {
  mockCancelMutate.mockReset();
  mockOnCancelled = undefined;
  mockAppointment.mockReturnValue(detail('confirmed'));
});

describe('CancelScreen', () => {
  it('asks for a reason and does not show the done card before the cancel succeeds', () => {
    const tree = mount();
    expect(text(tree)).toContain('Why is this being cancelled?');

    act(() =>
      tree.root
        .findByProps({ accessibilityLabel: 'Cancel booking' })
        .props.onPress(),
    );
    expect(mockCancelMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a-1', notify_customer: true }),
    );
    // The request is still in flight: no confirmation yet.
    expect(text(tree)).not.toContain('Booking cancelled');
    expect(text(tree)).toContain('Why is this being cancelled?');
  });

  it('keeps the done card when the refetch marks the booking cancelled', () => {
    const tree = mount();
    act(() =>
      tree.root
        .findByProps({ accessibilityLabel: 'Tell Olivia Bennett on WhatsApp' })
        .props.onCheckedChange(false),
    );
    act(() =>
      tree.root
        .findByProps({ accessibilityLabel: 'Cancel booking' })
        .props.onPress(),
    );

    // Invalidation lands first: the booking now reads as cancelled.
    mockAppointment.mockReturnValue(detail('cancelled'));
    rerender(tree);
    act(() => mockOnCancelled?.());

    const json = text(tree);
    expect(json).toContain('Booking cancelled');
    expect(json).toContain('No WhatsApp message was sent.');
    expect(json).not.toContain("This booking can't be cancelled.");
  });

  it('says the client will get a WhatsApp message when that was left on', () => {
    const tree = mount();
    act(() =>
      tree.root
        .findByProps({ accessibilityLabel: 'Cancel booking' })
        .props.onPress(),
    );
    act(() => mockOnCancelled?.());
    expect(text(tree)).toContain('Olivia Bennett will get a WhatsApp message.');
  });

  it('shows the not-allowed state for a booking that is already cancelled', () => {
    mockAppointment.mockReturnValue(detail('cancelled'));
    const json = text(mount());
    expect(json).toContain("This booking can't be cancelled.");
    expect(json).not.toContain('Booking cancelled');
  });
});
