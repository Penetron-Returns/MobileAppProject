import '@/lib/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NewBookingScreen } from '../components/NewBookingScreen';

const OLIVIA = {
  id: 'c-1',
  name: 'Olivia Bennett',
  phone_e164: '+27821234567',
};
const SARAH = { id: 'c-2', name: 'Sarah Jenkins', phone_e164: '+27825550101' };

// A fresh object per call, like a background refetch producing new data.
const mockUseClient = jest.fn();

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});
jest.mock('expo-router', () => ({
  router: { setParams: jest.fn(), navigate: jest.fn(), push: jest.fn() },
  usePathname: () => '/new-booking',
  useFocusEffect: (effect: () => void | (() => void)) => {
    const R = require('react');
    R.useEffect(effect, [effect]);
  },
}));
jest.mock('@/features/business/hooks', () => ({
  useBusiness: () => ({
    data: { id: 'b-1', timezone: 'Africa/Johannesburg', currency: 'ZAR' },
    isPending: false,
    isError: false,
  }),
}));
jest.mock('@/features/appointments/hooks', () => ({
  useBookingRules: () => ({ data: null }),
  usePrefetchAvailability: () => jest.fn(),
  useCreateAppointment: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/features/catalog/hooks', () => ({
  useServices: () => ({ data: [] }),
  useStaff: () => ({ data: [] }),
  useStaffServices: () => ({ data: [] }),
}));
jest.mock('@/features/clients/hooks', () => ({
  useClient: (id: string) => mockUseClient(id),
  useClientSearch: () => ({
    data: [OLIVIA, SARAH],
    isPending: false,
    isError: false,
  }),
}));

const metrics = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 375, height: 812 },
};
const ui = (props: { initialClientId?: string }) => (
  <QueryClientProvider client={new QueryClient()}>
    <SafeAreaProvider initialMetrics={metrics}>
      <NewBookingScreen {...props} />
    </SafeAreaProvider>
  </QueryClientProvider>
);

const isSelected = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll(
    (n) =>
      n.props.accessibilityLabel === label &&
      n.props.accessibilityState?.selected === true,
  ).length > 0;

beforeEach(() => {
  mockUseClient.mockReset();
  mockUseClient.mockImplementation((id: string) => ({
    data: id === 'c-1' ? { ...OLIVIA } : undefined,
  }));
});

describe('NewBookingScreen client preselect', () => {
  it('preselects the client from the route once the client has loaded', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(ui({ initialClientId: 'c-1' }));
    });
    expect(isSelected(tree, 'Pick Olivia Bennett')).toBe(true);
  });

  it('does not undo a different pick when the preselected client refetches', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(ui({ initialClientId: 'c-1' }));
    });
    act(() =>
      tree.root
        .findByProps({ accessibilityLabel: 'Pick Sarah Jenkins' })
        .props.onPress(),
    );
    expect(isSelected(tree, 'Pick Sarah Jenkins')).toBe(true);

    // Same client, new object: what a background refetch produces.
    act(() => tree.update(ui({ initialClientId: 'c-1' })));
    act(() => tree.update(ui({ initialClientId: 'c-1' })));
    expect(isSelected(tree, 'Pick Sarah Jenkins')).toBe(true);
    expect(isSelected(tree, 'Pick Olivia Bennett')).toBe(false);
  });

  it('selects nothing when no client is preselected', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(ui({}));
    });
    expect(isSelected(tree, 'Pick Olivia Bennett')).toBe(false);
    expect(mockUseClient).toHaveBeenCalledWith('');
  });
});
