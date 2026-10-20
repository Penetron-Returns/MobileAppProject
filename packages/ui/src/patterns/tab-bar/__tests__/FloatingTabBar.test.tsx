import * as React from 'react';
import { Dimensions } from 'react-native';

import { act, byLabel, pressable, render } from '../../../testing/render';
import { LAYOUT } from '../../../tokens/spacing';
import { FloatingTabBar } from '../FloatingTabBar';
import { InboxDome } from '../InboxDome';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

const NAMES = [
  'index',
  'calendar',
  'reports',
  'clients',
  'settings',
  'bookings/[id]',
];

function renderBar(
  activeName: string,
  options: {
    hidden?: boolean;
    dome?: React.ReactNode;
    tabs?: React.ComponentProps<typeof FloatingTabBar>['tabs'];
    onAdd?: () => void;
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
      tabs={options.tabs}
      onAdd={options.onAdd}
    />,
  );
  return { tree, navigation };
}

describe('FloatingTabBar', () => {
  afterEach(() => jest.restoreAllMocks());

  it('keeps the labels at normal and moderately large text sizes', () => {
    jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1.2 });
    const { tree } = renderBar('index');
    expect(
      tree.root.findAll((n) => (n.type as unknown) === 'Text').length,
    ).toBeGreaterThan(0);
  });

  it('drops to icons only at very large text sizes, keeping each tab labelled', () => {
    jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 2 });
    const { tree } = renderBar('index');
    expect(
      tree.root.findAll((n) => (n.type as unknown) === 'Text'),
    ).toHaveLength(0);
    expect(pressable(tree, 'Calendar').props.accessibilityRole).toBe('tab');
  });

  it('moves the pill and buzzes at once on press, before the new tab mounts', () => {
    const { tree, navigation } = renderBar('index');
    act(() => pressable(tree, 'Clients').props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('clients');
  });

  it('renders the four tabs and the centre plus', () => {
    const { tree } = renderBar('index', { onAdd: jest.fn() });
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

  it('calls onAdd from the centre plus without switching tabs', () => {
    const onAdd = jest.fn();
    const { tree, navigation } = renderBar('index', { onAdd });
    act(() => pressable(tree, 'New booking').props.onPress());
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('shows no plus and no Reports tab by default', () => {
    const { tree } = renderBar('index');
    expect(byLabel(tree, 'New booking')).toHaveLength(0);
    expect(byLabel(tree, 'Reports')).toHaveLength(0);
  });

  it('shows Reports as an ordinary tab in the given order on the paid variant', () => {
    const { tree, navigation } = renderBar('reports', {
      tabs: ['index', 'calendar', 'reports', 'clients', 'settings'],
    });
    const tabs = tree.root
      .findAll((n) => n.props.accessibilityRole === 'tab')
      .map((n) => n.props.accessibilityLabel);
    expect([...new Set(tabs)]).toEqual([
      'Today',
      'Calendar',
      'Reports',
      'Clients',
      'Settings',
    ]);
    expect(byLabel(tree, 'New booking')).toHaveLength(0);
    const selected = tree.root
      .findAll(
        (n) =>
          n.props.accessibilityRole === 'tab' &&
          n.props.accessibilityState?.selected,
      )
      .map((n) => n.props.accessibilityLabel);
    expect([...new Set(selected)]).toEqual(['Reports']);
    act(() => pressable(tree, 'Clients').props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('clients');
  });

  it('draws Reports exactly like the other tabs: same size, no dome, same colours', () => {
    const colourOf = (active: string, label: string) => {
      const props = {
        tabs: ['index', 'calendar', 'reports', 'clients', 'settings'],
      } as const;
      const routes = NAMES.map((name) => ({ key: `${name}-key`, name }));
      const tree = render(
        <FloatingTabBar
          {...({
            state: {
              index: routes.findIndex((r) => r.name === active),
              routes,
            },
            descriptors: Object.fromEntries(
              routes.map((r) => [r.key, { options: {} }]),
            ),
            navigation: { emit: jest.fn(), navigate: jest.fn() },
            ...props,
          } as unknown as React.ComponentProps<typeof FloatingTabBar>)}
        />,
      );
      const tab = pressable(tree, label);
      return tab.findAll((n) => typeof n.props.color === 'string')[0]?.props
        .color;
    };
    expect(colourOf('index', 'Reports')).toBe(colourOf('index', 'Calendar'));
    expect(colourOf('reports', 'Reports')).toBe(
      colourOf('calendar', 'Calendar'),
    );
    expect(colourOf('reports', 'Reports')).not.toBe(
      colourOf('index', 'Reports'),
    );
  });

  it('gives Reports the same layout classes and icon size as Calendar', () => {
    const { tree } = renderBar('index', {
      tabs: ['index', 'calendar', 'reports', 'clients', 'settings'],
    });
    const reports = pressable(tree, 'Reports');
    const calendar = pressable(tree, 'Calendar');
    expect(reports.props.className).toBe(calendar.props.className);
    const iconSize = (n: ReturnType<typeof pressable>) =>
      n.findAll((x) => typeof x.props.size === 'number')[0]?.props.size;
    expect(iconSize(reports)).toBe(iconSize(calendar));
    expect(iconSize(reports)).toBe(24);
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

  it('draws a flat edge-to-edge bar with a hairline top border', () => {
    const { tree } = renderBar('index');
    const row = tree.root.findAll(
      (n) => n.props.accessibilityRole === 'tablist',
    )[0];
    expect(row.props.style).toEqual({
      height: 64,
      paddingHorizontal: LAYOUT.screenPadding,
      paddingVertical: 4,
    });
    const flat = tree.root.findAll((n) => {
      const style = ([] as unknown[]).concat(n.props.style ?? []).flat();
      return style.some(
        (x) =>
          typeof x === 'object' &&
          x !== null &&
          (x as { borderTopWidth?: number }).borderTopWidth !== undefined,
      );
    })[0];
    const merged = Object.assign(
      {},
      ...([] as object[]).concat(flat.props.style).flat(),
    );
    expect(merged).toMatchObject({
      left: 0,
      right: 0,
      bottom: 0,
      boxShadow: 'none',
    });
    expect(merged.borderRadius).toBeUndefined();
  });

  it('renders nothing on screens that hide the tab bar', () => {
    const { tree } = renderBar('bookings/[id]', { hidden: true });
    expect(
      tree.root.findAll((n) => n.props.accessibilityRole === 'tab'),
    ).toHaveLength(0);
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
