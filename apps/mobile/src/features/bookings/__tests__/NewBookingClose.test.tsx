import '@/lib/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { BackHandler } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NewBookingScreen } from '../components/NewBookingScreen';

const OLIVIA = {
  id: 'c-1',
  name: 'Olivia Bennett',
  phone_e164: '+27821234567',
};
const mockBack = jest.fn();
const addListener = jest
  .spyOn(BackHandler, 'addEventListener')
  .mockImplementation(() => ({ remove: jest.fn() }));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});
jest.mock('expo-router', () => ({
  router: {
    setParams: jest.fn(),
    push: jest.fn(),
    canGoBack: () => true,
    back: () => mockBack(),
  },
  usePathname: () => '/new-booking',
  // The screen is not inside a navigator here, so run the effect on mount.
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = require('react');
    React.useEffect(effect, [effect]);
  },
}));
// The real dialog portals into a host the test renderer does not have.
jest.mock('@booking/ui/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: {
    open: boolean;
    title: string;
    confirmLabel: string;
    cancelLabel: string;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
  }) => {
    const { Pressable, Text } = require('react-native');
    return props.open ? (
      <>
        <Text>{props.title}</Text>
        <Pressable
          accessibilityLabel={props.cancelLabel}
          onPress={() => props.onOpenChange(false)}
        />
        <Pressable
          accessibilityLabel={props.confirmLabel}
          onPress={props.onConfirm}
        />
      </>
    ) : null;
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
  useCreateAppointment: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/features/catalog/hooks', () => ({
  useServices: () => ({ data: [] }),
  useStaff: () => ({ data: [] }),
  useStaffServices: () => ({ data: [] }),
}));
jest.mock('@/features/clients/hooks', () => ({
  useClient: () => ({ data: undefined }),
  useClientSearch: () => ({ data: [OLIVIA], isPending: false, isError: false }),
}));

const metrics = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 375, height: 812 },
};

function mount() {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <QueryClientProvider client={new QueryClient()}>
        <SafeAreaProvider initialMetrics={metrics}>
          <NewBookingScreen />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
  });
  return tree;
}

const press = (tree: renderer.ReactTestRenderer, label: string) =>
  act(() =>
    tree.root.findByProps({ accessibilityLabel: label }).props.onPress(),
  );
const showsDialog = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByProps({ children: 'Discard this booking?' }).length > 0;

// Capture the hardware-back listener the screen registers, and fire it like Android would.
const pressHardwareBack = () => {
  const handler = addListener.mock.calls.at(-1)?.[1] as () => boolean;
  handler();
};

beforeEach(() => {
  mockBack.mockReset();
  addListener.mockClear();
});

describe('New booking close', () => {
  it('closes immediately from the ✕ when nothing was entered', () => {
    const tree = mount();
    press(tree, 'Close');
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(showsDialog(tree)).toBe(false);
  });

  it('asks before discarding once a client is picked', () => {
    const tree = mount();
    press(tree, 'Pick Olivia Bennett');
    press(tree, 'Close');
    expect(mockBack).not.toHaveBeenCalled();
    expect(showsDialog(tree)).toBe(true);
  });

  it('stays on the form when the user keeps editing', () => {
    const tree = mount();
    press(tree, 'Pick Olivia Bennett');
    press(tree, 'Close');
    press(tree, 'Keep editing');
    expect(showsDialog(tree)).toBe(false);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('closes when the user confirms Discard', () => {
    const tree = mount();
    press(tree, 'Pick Olivia Bennett');
    press(tree, 'Close');
    press(tree, 'Discard');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('treats the Android back button like the ✕', () => {
    const tree = mount();
    act(() => pressHardwareBack());
    expect(mockBack).toHaveBeenCalledTimes(1);

    press(tree, 'Pick Olivia Bennett');
    act(() => pressHardwareBack());
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(showsDialog(tree)).toBe(true);
  });
});
