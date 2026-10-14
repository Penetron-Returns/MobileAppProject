import '@/lib/i18n';

import * as React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

let mockInbox = { isVisible: true, unreadCount: 2 };
jest.mock('../useInboxEntry', () => ({ useInboxEntry: () => mockInbox }));

import { FloatingTabBar } from '../FloatingTabBar';

const NAMES = [
  'index',
  'calendar',
  'add',
  'clients',
  'settings',
  'bookings/[id]',
];

function renderBar(activeName: string, hidden = false) {
  const routes = NAMES.map((name) => ({ key: `${name}-key`, name }));
  const state = {
    index: routes.findIndex((r) => r.name === activeName),
    routes,
  };
  const descriptors = Object.fromEntries(
    routes.map((r) => [
      r.key,
      {
        options:
          hidden && r.name === activeName
            ? { tabBarStyle: { display: 'none' } }
            : {},
      },
    ]),
  );
  const navigation = {
    emit: jest.fn(() => ({ defaultPrevented: false })),
    navigate: jest.fn(),
  };
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider
        initialMetrics={{
          insets: { top: 0, left: 0, right: 0, bottom: 34 },
          frame: { x: 0, y: 0, width: 402, height: 874 },
        }}
      >
        <FloatingTabBar
          {...({
            state,
            descriptors,
            navigation,
          } as unknown as React.ComponentProps<typeof FloatingTabBar>)}
        />
      </SafeAreaProvider>,
    );
  });
  return { tree, navigation };
}

describe('FloatingTabBar', () => {
  beforeEach(() => {
    mockInbox = { isVisible: true, unreadCount: 2 };
  });

  it('renders the four tabs, the centre plus and the Inbox dome', () => {
    const { tree } = renderBar('index');
    const labels = tree.root
      .findAll((n) => n.props.accessibilityLabel !== undefined)
      .map((n) => n.props.accessibilityLabel);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Today',
        'Calendar',
        'New booking',
        'Clients',
        'Settings',
        'Inbox, 2 need a reply',
      ]),
    );
  });

  it('marks only the current tab as selected', () => {
    const { tree } = renderBar('clients');
    const selected = tree.root
      .findAll(
        (n) =>
          n.props.accessibilityRole === 'tab' &&
          n.props.accessibilityState?.selected,
      )
      .map((n) => n.props.accessibilityLabel);
    expect([...new Set(selected)]).toEqual(['Clients']);
  });

  it('navigates to the add route from the centre plus', () => {
    const { tree, navigation } = renderBar('index');
    const plus = tree.root.find(
      (n) => n.props.accessibilityLabel === 'New booking' && !!n.props.onPress,
    );
    act(() => plus.props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('add');
  });

  it('hides the Inbox dome when the entry is off', () => {
    mockInbox = { isVisible: false, unreadCount: 0 };
    const { tree } = renderBar('index');
    expect(
      tree.root.findAll((n) =>
        String(n.props.accessibilityLabel ?? '').startsWith('Inbox'),
      ),
    ).toHaveLength(0);
  });

  it('shows no count in the label when nothing needs a reply', () => {
    mockInbox = { isVisible: true, unreadCount: 0 };
    const { tree } = renderBar('index');
    expect(
      tree.root.findAll((n) => n.props.accessibilityLabel === 'Inbox').length,
    ).toBeGreaterThan(0);
  });

  it('renders nothing on screens that hide the tab bar', () => {
    const { tree } = renderBar('bookings/[id]', true);
    expect(
      tree.root.findAll((n) => n.props.accessibilityRole === 'tab'),
    ).toHaveLength(0);
  });
});
