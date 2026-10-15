import * as React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';

import { Presenter } from '../../patterns/Presenter';
import { GlassPage } from '../../patterns/GlassPage';
import { BackPill } from '../../patterns/BackPill';
import { act, byLabel, pressable, render, textOf } from '../../testing/render';
import { getDepth } from '../../tokens/depth';
import { Avatar } from '../Avatar';
import { Chip } from '../Chips';
import { ColorSwatches } from '../ColorSwatches';
import { Disclosure } from '../Disclosure';
import { FormSheet } from '../FormSheet';
import { Group, GroupBlock, GroupRow } from '../Group';
import { InlineInsetInput } from '../InlineInsetInput';
import { SegmentedControl } from '../SegmentedControl';
import { Stepper } from '../Stepper';
import { TimeField } from '../TimeField';
import { TimeWheel } from '../TimeWheel';
import { TintLink } from '../TintLink';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

jest.mock('expo-router', () => ({
  router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn() },
}));

const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as ViewStyle &
    Record<string, unknown>;

describe('SegmentedControl choice variant', () => {
  const options = [
    { value: 'staff', label: 'Staff' },
    { value: 'owner', label: 'Owner' },
  ] as const;

  it('is a radio group with a 40pt track and a lit selected segment', () => {
    const onChange = jest.fn();
    const tree = render(
      <SegmentedControl
        variant="choice"
        label="Role"
        value="staff"
        options={options}
        onChange={onChange}
      />,
    );
    const group = byLabel(tree, 'Role')[0];
    expect(group.props.accessibilityRole).toBe('radiogroup');
    expect(String(group.props.className)).toContain('h-10');
    expect(flat(group.props.style).borderRadius).toBe(20);

    const staff = pressable(tree, 'Staff');
    expect(staff.props.accessibilityRole).toBe('radio');
    expect(staff.props.accessibilityState).toEqual({
      checked: true,
      selected: true,
    });
    expect(flat(staff.props.style).borderRadius).toBe(18);
    expect(flat(staff.props.style).backgroundColor).toBe(
      getDepth('light').segment.backgroundColor,
    );
    act(() => pressable(tree, 'Owner').props.onPress());
    expect(onChange).toHaveBeenCalledWith('owner');
  });

  it('keeps the tab semantics by default', () => {
    const tree = render(
      <SegmentedControl
        label="View"
        value="staff"
        options={options}
        onChange={jest.fn()}
      />,
    );
    expect(pressable(tree, 'Staff').props.accessibilityRole).toBe('tab');
  });
});

describe('Chip option variants', () => {
  it('choice is a radio, toggle is a pressed button, both 44pt', () => {
    const choice = render(
      <Chip variant="choice" label="Chair" selected onPress={jest.fn()} />,
    );
    const toggle = render(
      <Chip
        variant="toggle"
        label="Thandi"
        selected={false}
        dotColor="#007AFF"
        onPress={jest.fn()}
      />,
    );
    expect(pressable(choice, 'Chair').props.accessibilityRole).toBe('radio');
    const button = pressable(toggle, 'Thandi');
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityState).toEqual({ selected: false });
    expect(String(button.props.className)).toContain('min-h-11');
    expect(JSON.stringify(toggle.toJSON())).toContain('#007AFF');
  });

  it('rests raised and turns tactile tint when selected', () => {
    const off = render(
      <Chip variant="choice" label="A" selected={false} onPress={jest.fn()} />,
    );
    const on = render(
      <Chip variant="choice" label="A" selected onPress={jest.fn()} />,
    );
    const bg = (t: ReturnType<typeof render>) =>
      JSON.stringify(t.toJSON()).includes(
        JSON.stringify(getDepth('light').primary.backgroundColor).slice(1, -1),
      );
    expect(bg(on)).toBe(true);
    expect(bg(off)).toBe(false);
  });
});

describe('TintLink action variant', () => {
  it('is 52pt tall and semibold', () => {
    const tree = render(
      <TintLink variant="action" label="Add a service" onPress={jest.fn()} />,
    );
    const link = pressable(tree, 'Add a service');
    expect(String(link.props.className)).toContain('min-h-[52px]');
    expect(JSON.stringify(tree.toJSON())).toContain('text-title font-semibold');
  });
});

describe('Disclosure', () => {
  it('reports expanded and toggles', () => {
    const onPress = jest.fn();
    const tree = render(<Disclosure label="More" expanded onPress={onPress} />);
    const row = pressable(tree, 'More');
    expect(row.props.accessibilityState).toEqual({ expanded: true });
    act(() => row.props.onPress());
    expect(onPress).toHaveBeenCalled();
  });

  it('turns the chevron over on a wrapping view, not on the icon', () => {
    const turn = (expanded: boolean) => {
      const tree = render(
        <Disclosure label="More" expanded={expanded} onPress={jest.fn()} />,
      );
      const wrapper = tree.root.find(
        (n) =>
          typeof n.type === 'string' &&
          JSON.stringify(n.props.style ?? '').includes('rotate'),
      );
      return JSON.stringify(wrapper.props.style);
    };
    expect(turn(true)).toContain('180deg');
    expect(turn(false)).toContain('0deg');
  });
});

describe('Stepper', () => {
  it('shows the value and steps both ways', () => {
    const down = jest.fn();
    const up = jest.fn();
    const tree = render(
      <Stepper
        valueText="1 h"
        decrementLabel="Shorter"
        incrementLabel="Longer"
        onDecrement={down}
        onIncrement={up}
      />,
    );
    expect(textOf(tree)).toContain('1 h');
    act(() => pressable(tree, 'Shorter').props.onPress());
    act(() => pressable(tree, 'Longer').props.onPress());
    expect(down).toHaveBeenCalledTimes(1);
    expect(up).toHaveBeenCalledTimes(1);
  });

  it('dims and blocks a disabled end', () => {
    const tree = render(
      <Stepper
        valueText="15 min"
        decrementLabel="Shorter"
        incrementLabel="Longer"
        onDecrement={jest.fn()}
        onIncrement={jest.fn()}
        disableDecrement
      />,
    );
    expect(pressable(tree, 'Shorter').props.accessibilityState).toEqual({
      disabled: true,
    });
  });
});

describe('TimeField', () => {
  it('washes in the tint while its wheel is open', () => {
    const idle = render(
      <TimeField
        value="08:00"
        label="Monday opens at 08:00"
        onPress={jest.fn()}
      />,
    );
    const open = render(
      <TimeField
        active
        value="08:00"
        label="Monday opens at 08:00"
        onPress={jest.fn()}
      />,
    );
    const depth = getDepth('light');
    const idleStyle = flat(
      pressable(idle, 'Monday opens at 08:00').props.style,
    );
    const openStyle = flat(
      pressable(open, 'Monday opens at 08:00').props.style,
    );
    expect(idleStyle.backgroundColor).toBe(depth.inset.backgroundColor);
    expect(openStyle.backgroundColor).toBe(depth.tintWash);
    expect(openStyle.borderRadius).toBe(9);
  });
});

describe('TimeWheel', () => {
  const labels = {
    hourLabel: (h: string) => `Hour ${h}`,
    minuteLabel: (m: string) => `Minutes ${m}`,
  };

  it('moves the hour and the minutes from the rows around the middle', () => {
    const onChange = jest.fn();
    const tree = render(
      <TimeWheel value="08:15" onChange={onChange} {...labels} />,
    );
    act(() => pressable(tree, 'Hour 09').props.onPress());
    expect(onChange).toHaveBeenLastCalledWith('09:15');
    act(() => pressable(tree, 'Minutes 30').props.onPress());
    expect(onChange).toHaveBeenLastCalledWith('08:30');
  });

  it('offers nothing before the first hour or past the last minute', () => {
    const tree = render(
      <TimeWheel value="05:45" onChange={jest.fn()} {...labels} />,
    );
    expect(byLabel(tree, 'Hour 04')).toHaveLength(0);
    expect(byLabel(tree, 'Hour 03')).toHaveLength(0);
    expect(byLabel(tree, 'Minutes 60')).toHaveLength(0);
    expect(pressable(tree, 'Hour 06')).toBeTruthy();
  });
});

describe('ColorSwatches', () => {
  it('ticks the picked colour and reports a pick', () => {
    const onChange = jest.fn();
    const tree = render(
      <ColorSwatches
        value="orange"
        onChange={onChange}
        labelFor={(k) => k.toUpperCase()}
      />,
    );
    expect(pressable(tree, 'ORANGE').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(pressable(tree, 'BLUE').props.accessibilityState).toEqual({
      selected: false,
    });
    act(() => pressable(tree, 'TEAL').props.onPress());
    expect(onChange).toHaveBeenCalledWith('teal');
  });

  it('paints the dark variant in dark mode', () => {
    const tree = render(
      <ColorSwatches value={null} onChange={jest.fn()} labelFor={String} />,
      'dark',
    );
    expect(JSON.stringify(tree.toJSON())).toContain('#0A84FF');
  });
});

describe('InlineInsetInput', () => {
  it('is a labelled 40pt field with right-aligned text', () => {
    const tree = render(<InlineInsetInput label="Name" value="Cut" />);
    const input = byLabel(tree, 'Name').find(
      (n) => typeof n.type === 'string' || n.props.value !== undefined,
    );
    expect(input?.props.className).toContain('text-right');
    expect(JSON.stringify(tree.toJSON())).toContain('h-10 justify-center');
  });
});

describe('Avatar ring, tint and hero', () => {
  it('rings the dome in the given colour', () => {
    const tree = render(<Avatar name="Thandi Mokoena" ring="#FF9500" />);
    const dome = tree.root.find(
      (n) =>
        typeof n.type === 'string' &&
        n.props.importantForAccessibility === 'no-hide-descendants',
    );
    expect(flat(dome.props.style)).toMatchObject({
      borderWidth: 2,
      borderColor: '#FF9500',
    });
    expect(flat(dome.props.style).boxShadow).toBe(
      getDepth('light').domeRing.boxShadow,
    );
  });

  it('is 84pt with a 3pt ring in the hero size', () => {
    const tree = render(
      <Avatar name="Thandi Mokoena" size="hero" ring="#FF9500" />,
    );
    const dome = tree.root.find(
      (n) =>
        typeof n.type === 'string' &&
        n.props.importantForAccessibility === 'no-hide-descendants',
    );
    expect(String(dome.props.className)).toContain('h-[84px]');
    expect(flat(dome.props.style).borderWidth).toBe(3);
    expect(flat(dome.props.style).borderRadius).toBe(42);
  });

  it('fills with the tint and shows white 20pt initials', () => {
    const tree = render(<Avatar name="Ashgrove Hair" tone="tint" size="lg" />);
    const dome = tree.root.find(
      (n) =>
        typeof n.type === 'string' &&
        n.props.importantForAccessibility === 'no-hide-descendants',
    );
    expect(flat(dome.props.style).boxShadow).toBe(
      getDepth('light').domeTint.boxShadow,
    );
    expect(JSON.stringify(tree.toJSON())).toContain('text-xl');
  });
});

describe('Group metrics', () => {
  it('takes a radius and adds an engraved line to a custom block', () => {
    const tree = render(
      <Group radius={26}>
        <GroupBlock showSeparator>{null}</GroupBlock>
      </Group>,
    );
    const group = tree.root.find((n) => n.props.variant === 'raised');
    expect(group.props.radius).toBe(26);
    expect(
      tree.root.findAll((n) => n.props.variant === 'engrave'),
    ).not.toHaveLength(0);
  });

  it('shows a pressed row in the row-pressed fill', () => {
    const tree = render(<GroupRow title="Hours" onPress={jest.fn()} />);
    const row = pressable(tree, 'Hours');
    expect(flat(row.props.style({ pressed: true })).backgroundColor).toBe(
      getDepth('light').rowPressed.backgroundColor,
    );
    expect(row.props.style({ pressed: false })).toBeUndefined();
  });
});

describe('FormSheet', () => {
  it('shows nothing closed and the title, body and footer open', () => {
    const closed = render(
      <FormSheet open={false} onClose={jest.fn()} title="Edit service">
        {'body'}
      </FormSheet>,
    );
    expect(textOf(closed)).not.toContain('Edit service');
    const open = render(
      <FormSheet
        open
        onClose={jest.fn()}
        title="Edit service"
        footer={<>{'save here'}</>}
      >
        {'body text'}
      </FormSheet>,
    );
    const text = textOf(open);
    expect(text).toContain('Edit service');
    expect(text).toContain('body text');
    expect(text).toContain('save here');
  });

  it('cancels from the tint button', () => {
    const onClose = jest.fn();
    const tree = render(
      <FormSheet open onClose={onClose} title="Edit service">
        {null}
      </FormSheet>,
    );
    act(() => pressable(tree, 'Cancel').props.onPress());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Presenter', () => {
  it('renders its screen, active or not', () => {
    const idle = render(<Presenter active={false}>{'screen'}</Presenter>);
    const active = render(<Presenter active>{'screen'}</Presenter>);
    expect(textOf(idle)).toBe('screen');
    expect(textOf(active)).toBe('screen');
  });
});

describe('glass navigation', () => {
  it('draws a frosted back pill with the board metrics', () => {
    const onPress = jest.fn();
    const tree = render(
      <BackPill variant="glass" label="Settings" onPress={onPress} />,
    );
    act(() => pressable(tree, 'Settings').props.onPress());
    expect(onPress).toHaveBeenCalled();
    const pill = tree.root.find((n) =>
      String(n.props.className ?? '').includes('h-[38px]'),
    );
    expect(flat(pill.props.style)).toMatchObject({
      borderRadius: 19,
      borderWidth: 0.5,
      backgroundColor: getDepth('light').glass.backgroundColor,
    });
  });

  it('centres a 17pt title and puts the back pill under the status bar', () => {
    const tree = render(
      <GlassPage title="Team" backLabel="Settings" backFallback="/settings">
        {'content'}
      </GlassPage>,
    );
    expect(textOf(tree)).toContain('Team');
    expect(textOf(tree)).toContain('content');
    expect(
      tree.root.find((n) => n.props.role === 'heading').props.className,
    ).toContain('font-semibold');
    expect(pressable(tree, 'Settings')).toBeTruthy();
  });

  it('pins a footer under the scroll area', () => {
    const tree = render(
      <GlassPage
        title="Operating hours"
        backLabel="Settings"
        footer={<>{'footer here'}</>}
      >
        {null}
      </GlassPage>,
    );
    expect(textOf(tree)).toContain('footer here');
  });
});
