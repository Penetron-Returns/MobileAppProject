import * as React from 'react';

import { act, mount, pressableByLabel } from '@/testing/render';

import { AppTabBar } from '../AppTabBar';

jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return { WebView: View };
});

const mockPush = jest.fn();
const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockPush(...a),
    navigate: (...a: unknown[]) => mockNavigate(...a),
  },
}));

let mockHas: (feature: string) => boolean = () => false;
jest.mock('@/features/plans/hooks', () => ({
  useEntitlements: () => ({ has: (f: string) => mockHas(f) }),
}));

const NAMES = ['index', 'calendar', 'reports', 'clients', 'settings'];

function bar() {
  const routes = NAMES.map((name) => ({ key: `${name}-key`, name }));
  const props = {
    state: { index: 0, routes },
    descriptors: Object.fromEntries(
      routes.map((r) => [r.key, { options: {} }]),
    ),
    navigation: {
      emit: jest.fn(() => ({ defaultPrevented: false })),
      navigate: jest.fn(),
    },
  };
  return mount(
    <AppTabBar
      {...(props as unknown as React.ComponentProps<typeof AppTabBar>)}
    />,
  );
}

const labels = (tree: ReturnType<typeof mount>) =>
  tree.root
    .findAll((n) => typeof n.props.accessibilityLabel === 'string')
    .map((n) => n.props.accessibilityLabel as string);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AppTabBar', () => {
  it('Reports is an ordinary tab, there is no plus and the companion bubble replaces the Inbox', () => {
    mockHas = (f) => f === 'companion' || f === 'reports';
    const tree = bar();
    const all = labels(tree);
    expect(all).toContain('Open your companion');
    expect(all).not.toContain('New booking');
    expect(all.some((l) => l.startsWith('Inbox'))).toBe(false);
    const tabs = tree.root
      .findAll((n) => n.props.accessibilityRole === 'tab')
      .map((n) => n.props.accessibilityLabel as string);
    expect([...new Set(tabs)]).toEqual([
      'Clovie',
      'Calendar',
      'Reports',
      'Clients',
      'Settings',
    ]);
    expect(
      tree.root.findAllByProps({ testID: 'clovie-tab-icon' }).length,
    ).toBeGreaterThan(0);
    act(() => pressableByLabel(tree, 'Reports').props.onPress());
    expect(mockPush).not.toHaveBeenCalled();
    act(() => pressableByLabel(tree, 'Open your companion').props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/companion');
  });

  it('the companion bubble is hidden on the Clovie tab', () => {
    mockHas = (f) => f === 'companion';
    const tree = bar();
    const fade = tree.root.findByProps({ testID: 'companion-dome-fade' });
    expect(fade.props.pointerEvents).toBe('none');
  });
});
