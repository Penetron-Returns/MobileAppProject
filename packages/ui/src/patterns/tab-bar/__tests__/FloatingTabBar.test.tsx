import * as React from 'react';

import { act, byLabel, pressable, render } from '../../../testing/render';
import { FloatingTabBar } from '../FloatingTabBar';
import { CompanionDome } from '../CompanionDome';
import { InboxDome } from '../InboxDome';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

const NAMES = ['index', 'calendar', 'clients', 'settings', 'bookings/[id]'];

function renderBar(
  activeName: string,
  options: {
    hidden?: boolean;
    dome?: React.ReactNode;
    center?: 'add' | 'reports';
    onCenter?: () => void;
  } = {},
) {
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
          options.hidden && r.name === activeName
            ? { tabBarStyle: { display: 'none' } }
            : {},
      },
    ]),
  );
  const navigation = {
    emit: jest.fn(() => ({ defaultPrevented: false })),
    navigate: jest.fn(),
  };
  const tree = render(
    <FloatingTabBar
      {...({
        state,
        descriptors,
        navigation,
      } as unknown as React.ComponentProps<typeof FloatingTabBar>)}
      dome={options.dome}
      center={options.center}
      onCenter={options.onCenter}
    />,
  );
  return { tree, navigation };
}

describe('FloatingTabBar', () => {
  it('renders the four tabs and the centre plus', () => {
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

  it('calls onCenter from the centre plus without switching tabs', () => {
    const onCenter = jest.fn();
    const { tree, navigation } = renderBar('index', { onCenter });
    act(() => pressable(tree, 'New booking').props.onPress());
    expect(onCenter).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('swaps the centre plus for Reports on the paid variant', () => {
    const onCenter = jest.fn();
    const { tree } = renderBar('index', { center: 'reports', onCenter });
    expect(byLabel(tree, 'New booking')).toHaveLength(0);
    act(() => pressable(tree, 'Reports').props.onPress());
    expect(onCenter).toHaveBeenCalledTimes(1);
  });

  it('navigates to a tab and emits tabPress first', () => {
    const { tree, navigation } = renderBar('index');
    act(() => pressable(tree, 'Calendar').props.onPress());
    expect(navigation.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tabPress', target: 'calendar-key' }),
    );
    expect(navigation.navigate).toHaveBeenCalledWith('calendar');
  });

  it('shows whatever Inbox entry the app passes in', () => {
    const { tree } = renderBar('index', {
      dome: (
        <InboxDome
          count={2}
          label="Inbox, 2 need a reply"
          onPress={jest.fn()}
        />
      ),
    });
    expect(byLabel(tree, 'Inbox, 2 need a reply').length).toBeGreaterThan(0);
  });

  it('shows no Inbox entry when the app passes none', () => {
    const { tree } = renderBar('index');
    expect(
      tree.root.findAll((n) =>
        String(n.props.accessibilityLabel ?? '').startsWith('Inbox'),
      ),
    ).toHaveLength(0);
  });

  it('renders nothing on screens that hide the tab bar', () => {
    const { tree } = renderBar('bookings/[id]', { hidden: true });
    expect(
      tree.root.findAll((n) => n.props.accessibilityRole === 'tab'),
    ).toHaveLength(0);
  });
});

describe('CompanionDome', () => {
  const character = { uri: 'companion.png' };

  it('shows the count badge only when something needs attention', () => {
    const withCount = render(
      <CompanionDome
        character={character}
        count={3}
        label="Companion"
        onPress={jest.fn()}
      />,
    );
    const without = render(
      <CompanionDome
        character={character}
        count={0}
        label="Companion"
        onPress={jest.fn()}
      />,
    );
    const hasBadge = (t: ReturnType<typeof render>) =>
      t.root.findAll((n) => n.children.includes('3')).length > 0;
    expect(hasBadge(withCount)).toBe(true);
    expect(hasBadge(without)).toBe(false);
  });

  it('opens through onPress', () => {
    const onPress = jest.fn();
    const tree = render(
      <CompanionDome
        character={character}
        count={0}
        label="Open your companion"
        onPress={onPress}
      />,
    );
    act(() => pressable(tree, 'Open your companion').props.onPress());
    expect(onPress).toHaveBeenCalled();
  });
});

describe('InboxDome', () => {
  it('shows the count badge only when something needs a reply', () => {
    const withCount = render(
      <InboxDome count={3} label="Inbox" onPress={jest.fn()} />,
    );
    const without = render(
      <InboxDome count={0} label="Inbox" onPress={jest.fn()} />,
    );
    const hasBadge = (t: ReturnType<typeof render>) =>
      t.root.findAll((n) => n.children.includes('3')).length > 0;
    expect(hasBadge(withCount)).toBe(true);
    expect(hasBadge(without)).toBe(false);
  });

  it('opens through onPress', () => {
    const onPress = jest.fn();
    const tree = render(
      <InboxDome count={0} label="Inbox" onPress={onPress} />,
    );
    act(() => pressable(tree, 'Inbox').props.onPress());
    expect(onPress).toHaveBeenCalled();
  });
});
