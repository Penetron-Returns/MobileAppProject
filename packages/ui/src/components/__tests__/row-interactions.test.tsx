import * as Haptics from 'expo-haptics';
import * as React from 'react';
import { AccessibilityInfo, View } from 'react-native';

import { act, byLabel, pressable, render, textOf } from '../../testing/render';
import { GroupRow } from '../Group';
import { Menu } from '../Menu';
import { RowContextMenu } from '../RowContextMenu';
import { SwipeableRow } from '../SwipeableRow';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

jest.mock('lucide-react-native', () => {
  const { View: Glyph } = require('react-native');
  return new Proxy({}, { get: () => Glyph });
});

const haptic = Haptics as jest.Mocked<typeof Haptics>;

beforeEach(() => jest.clearAllMocks());

describe('SwipeableRow', () => {
  function row(onPress = jest.fn(), enabled = true) {
    const tree = render(
      <SwipeableRow
        enabled={enabled}
        trailing={[
          {
            key: 'delete',
            label: 'Delete',
            spokenLabel: 'Delete Cut',
            role: 'destructive',
            onPress,
          },
        ]}
      >
        <GroupRow title="Cut" onPress={jest.fn()} />
      </SwipeableRow>,
    );
    return { tree, onPress };
  }

  const swipeable = (tree: ReturnType<typeof row>['tree']) =>
    tree.root.find((n) => typeof n.props.onSwipeableWillOpen === 'function');

  it('renders the row and its trailing action', () => {
    const { tree, onPress } = row();
    expect(textOf(tree)).toContain('Cut');
    expect(textOf(tree)).toContain('Delete');
    act(() => pressable(tree, 'Delete Cut').props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is also an accessibility action on the row, so it never needs the gesture', () => {
    const { tree, onPress } = row();
    const rowNode = pressable(tree, 'Cut');
    expect(rowNode.props.accessibilityActions).toEqual([
      { name: 'delete', label: 'Delete Cut' },
    ]);
    act(() =>
      rowNode.props.onAccessibilityAction({
        nativeEvent: { actionName: 'delete' },
      }),
    );
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('buzzes once at the full-swipe threshold and triggers the first action on release', () => {
    const { tree, onPress } = row();
    const panel = tree.root.find((n) => typeof n.props.onArm === 'function');
    act(() => panel.props.onArm(true));
    expect(haptic.impactAsync).toHaveBeenCalledTimes(1);
    act(() => panel.props.onArm(true));
    expect(haptic.impactAsync).toHaveBeenCalledTimes(1);
    act(() => swipeable(tree).props.onSwipeableWillOpen('right'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('only opens the actions on a short swipe', () => {
    const { tree, onPress } = row();
    act(() => swipeable(tree).props.onSwipeableWillOpen('right'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders just the row when disabled (the owner, the signed-in person)', () => {
    const { tree } = row(jest.fn(), false);
    expect(textOf(tree)).toContain('Cut');
    expect(textOf(tree)).not.toContain('Delete');
    expect(pressable(tree, 'Cut').props.accessibilityActions).toBeUndefined();
  });
});

/** The test renderer has no native layout: report a fixed frame for any view. */
function stubLayout() {
  const proto = View.prototype as unknown as {
    measureInWindow: (cb: (...args: number[]) => void) => void;
  };
  return jest
    .spyOn(proto, 'measureInWindow')
    .mockImplementation((cb) => cb(20, 200, 360, 60));
}

describe('RowContextMenu', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    stubLayout();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function menu() {
    const open = jest.fn();
    const book = jest.fn();
    const remove = jest.fn();
    const tree = render(
      <RowContextMenu
        actions={[
          { key: 'open', label: 'Open', onPress: open },
          { key: 'book', label: 'Book', onPress: book },
          {
            key: 'remove',
            label: 'Remove',
            destructive: true,
            onPress: remove,
          },
        ]}
      >
        <GroupRow title="Thandi" onPress={jest.fn()} />
      </RowContextMenu>,
    );
    return { tree, open, book, remove };
  }

  const longPress = (tree: ReturnType<typeof menu>['tree']) =>
    act(() => pressable(tree, 'Thandi').props.onLongPress());

  it('stays closed until the row is long-pressed, then lifts it with a haptic', () => {
    const { tree } = menu();
    expect(byLabel(tree, 'Book')).toHaveLength(0);
    longPress(tree);
    expect(haptic.impactAsync).toHaveBeenCalledTimes(1);
    expect(byLabel(tree, 'Book').length).toBeGreaterThan(0);
    expect(textOf(tree)).toContain('Remove');
  });

  it('runs the chosen action once the menu has gone', () => {
    const { tree, book, open } = menu();
    longPress(tree);
    act(() => pressable(tree, 'Book').props.onPress());
    expect(byLabel(tree, 'Open')).toHaveLength(0);
    expect(book).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(700);
    });
    expect(book).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });

  it('dismisses from the backdrop without running anything', () => {
    const { tree, open, book, remove } = menu();
    longPress(tree);
    act(() => pressable(tree, 'Dismiss').props.onPress());
    act(() => {
      jest.advanceTimersByTime(700);
    });
    expect(byLabel(tree, 'Book')).toHaveLength(0);
    expect(open).not.toHaveBeenCalled();
    expect(book).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('offers the same actions as accessibility actions', () => {
    const { tree, book } = menu();
    const row = pressable(tree, 'Thandi');
    const names = row.props.accessibilityActions.map(
      (a: { name: string }) => a.name,
    );
    expect(names).toEqual(['open', 'book', 'remove']);
    act(() =>
      row.props.onAccessibilityAction({ nativeEvent: { actionName: 'book' } }),
    );
    expect(book).toHaveBeenCalledTimes(1);
  });

  it('still opens with reduced motion on', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    const { tree } = menu();
    await act(async () => {});
    longPress(tree);
    expect(byLabel(tree, 'Open').length).toBeGreaterThan(0);
  });
});

describe('Menu', () => {
  beforeEach(() => {
    stubLayout();
  });
  afterEach(() => jest.restoreAllMocks());

  const TRIGGER = 'October 2026. Choose a month';

  function months(selected: string | null) {
    const onSelect = jest.fn();
    const tree = render(
      <Menu
        options={[
          { value: 'oct', label: 'October 2026' },
          { value: 'sep', label: 'September 2026' },
        ]}
        selected={selected}
        onSelect={onSelect}
        accessibilityLabel={TRIGGER}
      >
        {'October 2026'}
      </Menu>,
    );
    return { tree, onSelect };
  }

  it('opens an anchored card with the current choice checked', () => {
    const { tree } = months('oct');
    expect(byLabel(tree, 'September 2026')).toHaveLength(0);
    act(() => pressable(tree, TRIGGER).props.onPress());
    const checked = tree.root.findAll(
      (n) => n.props.accessibilityState?.checked === true,
    );
    expect(checked.length).toBeGreaterThan(0);
    expect(byLabel(tree, 'September 2026').length).toBeGreaterThan(0);
  });

  it('selects another option, buzzes and closes', () => {
    const { tree, onSelect } = months('oct');
    act(() => pressable(tree, TRIGGER).props.onPress());
    act(() => pressable(tree, 'September 2026').props.onPress());
    expect(onSelect).toHaveBeenCalledWith('sep');
    expect(haptic.selectionAsync).toHaveBeenCalledTimes(1);
    expect(byLabel(tree, 'September 2026')).toHaveLength(0);
  });

  it('does not report the choice that is already selected', () => {
    const { tree, onSelect } = months('oct');
    act(() => pressable(tree, TRIGGER).props.onPress());
    act(() => pressable(tree, 'October 2026').props.onPress());
    expect(onSelect).not.toHaveBeenCalled();
  });
});
