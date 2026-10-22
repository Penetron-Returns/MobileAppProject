import * as React from 'react';

import { act, mount, pressableByLabel } from '@/testing/render';

import { AppTabBar } from '../AppTabBar';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockPush(...a),
    navigate: (...a: unknown[]) => mockNavigate(...a),
  },
}));

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
const mockUseQuery = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));

const NAMES = ['index', 'calendar', 'reports', 'clients', 'settings', 'inbox'];

function bar() {
  const routes = NAMES.map((name) => ({ key: `${name}-key`, name }));
  const props = {
    state: { index: 1, routes },
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
  mockUseQuery.mockReturnValue({ data: 0 });
});

describe('AppTabBar', () => {
  it('shows Dashboard, Calendar, Reports, Clients and Settings, and no Clovie tab', () => {
    const tree = bar();
    const tabs = tree.root
      .findAll((n) => n.props.accessibilityRole === 'tab')
      .map((n) => n.props.accessibilityLabel as string);
    expect([...new Set(tabs)]).toEqual([
      'Dashboard',
      'Calendar',
      'Reports',
      'Clients',
      'Settings',
    ]);
  });

  it('the Inbox bubble shows the open count and opens the Inbox', () => {
    mockUseQuery.mockReturnValue({ data: 2 });
    const tree = bar();
    expect(labels(tree)).toContain('Inbox, 2 need a reply');
    act(() => pressableByLabel(tree, 'Inbox, 2 need a reply').props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/inbox');
  });
});
