import * as React from 'react';

import { act, mount, pressableByLabel } from '@/testing/render';

import { CalendarHeader } from '../components/CalendarHeader';
import { DayView } from '../components/DayView';
import {
  minuteAtOffset,
  newBookingHref,
  PX_PER_HOUR,
  type NewBookingPrefill,
} from '../logic';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

describe('minuteAtOffset', () => {
  const window = { startMin: 8 * 60, endMin: 18 * 60 };
  it.each([
    ['the top of the grid', 0, 480],
    ['two hours down', PX_PER_HOUR * 2, 600],
    ['snaps down to the quarter hour', PX_PER_HOUR * 2 + 20, 600],
    ['a quarter past', PX_PER_HOUR * 2 + 24, 615],
    ['above the grid clamps to the start', -50, 480],
    ['below the grid stops one step before the end', PX_PER_HOUR * 11, 1065],
  ])('%s', (_name, y, expected) => {
    expect(minuteAtOffset(y, window)).toBe(expected);
  });
});

describe('newBookingHref', () => {
  it('carries staff, day and time as params of the New booking route', () => {
    expect(
      newBookingHref({ staffId: 's1', date: '2026-10-14', time: '10:00' }),
    ).toEqual({
      pathname: '/new-booking',
      params: { staffId: 's1', date: '2026-10-14', time: '10:00' },
    });
  });
  it('leaves out what is not known (the header action only knows the day)', () => {
    expect(newBookingHref({ date: '2026-10-14' })).toEqual({
      pathname: '/new-booking',
      params: { date: '2026-10-14' },
    });
  });
});

const READY = {
  status: 'ready',
  columns: [
    {
      staff: { id: 'staff-1', name: 'Thandi' },
      appointments: [],
      working: [{ startMin: 8 * 60, endMin: 18 * 60 }],
      blocks: [],
    },
  ],
  window: { startMin: 8 * 60, endMin: 18 * 60 },
  timezone: 'Africa/Johannesburg',
  now: new Date('2026-10-14T08:00:00Z'),
  closedDay: null,
  isOffline: false,
  refresh: jest.fn(),
} as unknown as React.ComponentProps<typeof DayView>['view'];

const longPressLayers = (tree: ReturnType<typeof mount>) =>
  tree.root.findAll(
    (n) => !!n.props.onLongPress && n.props.accessible === false,
  );

describe('DayView long-press', () => {
  it('opens a booking for that staff and time on an empty slot', () => {
    const onCreateAt = jest.fn<void, [NewBookingPrefill]>();
    const tree = mount(
      <DayView
        view={READY}
        date="2026-10-14"
        bottomInset={0}
        onCreateAt={onCreateAt}
      />,
    );
    const layer = longPressLayers(tree)[0];
    act(() =>
      layer.props.onLongPress({ nativeEvent: { locationY: PX_PER_HOUR * 2 } }),
    );
    expect(onCreateAt).toHaveBeenCalledWith({
      staffId: 'staff-1',
      date: '2026-10-14',
      time: '10:00',
    });
  });

  it('does nothing on Free, where the plus is in the tab bar', () => {
    const tree = mount(
      <DayView view={READY} date="2026-10-14" bottomInset={0} />,
    );
    expect(longPressLayers(tree)).toHaveLength(0);
  });
});

describe('CalendarHeader New booking action', () => {
  const props = {
    view: 'day' as const,
    anchor: '2026-10-14',
    today: '2026-10-14',
    onViewChange: jest.fn(),
    onAnchor: jest.fn(),
    onShift: jest.fn(),
  };

  it('shows a New booking action when the plan has no plus', () => {
    const onNewBooking = jest.fn();
    const tree = mount(
      <CalendarHeader {...props} onNewBooking={onNewBooking} />,
    );
    act(() => pressableByLabel(tree, 'New booking').props.onPress());
    expect(onNewBooking).toHaveBeenCalledTimes(1);
  });

  it('hides it otherwise', () => {
    const tree = mount(<CalendarHeader {...props} />);
    expect(
      tree.root.findAll((n) => n.props.accessibilityLabel === 'New booking'),
    ).toHaveLength(0);
  });
});

describe('DayView horizontal scrolling', () => {
  const staff = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      ...READY.columns[0],
      staff: { id: `staff-${i}`, name: `Person ${i}` },
    }));
  const grid = (n: number) =>
    mount(
      <DayView
        view={{ ...READY, columns: staff(n) } as typeof READY}
        date="2026-10-14"
        bottomInset={0}
      />,
    );
  const scroller = (tree: ReturnType<typeof mount>) =>
    tree.root.find(
      (node) => node.props.horizontal === true && 'scrollEnabled' in node.props,
    );

  it('scrolls sideways from the first column with three or more staff', () => {
    const props = scroller(grid(3)).props;
    expect(props.scrollEnabled).toBe(true);
    expect(props.contentOffset).toEqual({ x: 0, y: 0 });
    expect(props.bounces).toBe(false);
  });

  it('keeps one or two staff fixed, filling the width next to the gutter', () => {
    expect(scroller(grid(2)).props.scrollEnabled).toBe(false);
    expect(scroller(grid(1)).props.scrollEnabled).toBe(false);
  });
});
