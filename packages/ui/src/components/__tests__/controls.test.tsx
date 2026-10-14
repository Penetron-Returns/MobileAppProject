import { Bell } from 'lucide-react-native';
import * as React from 'react';

import { act, byLabel, pressable, render, textOf } from '../../testing/render';
import { getDepth } from '../../tokens/depth';
import { Chip, Chips } from '../Chips';
import { ChoiceCard } from '../ChoiceCard';
import { IconButton } from '../IconButton';
import { AmountInsetField, LabeledInsetField } from '../InsetFields';
import { InsetInput } from '../InsetInput';
import { SearchField } from '../SearchField';
import { SegmentedControl } from '../SegmentedControl';
import { Switch } from '../Switch';
import { SwitchRow } from '../SwitchRow';
import { TintLink } from '../TintLink';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

describe('IconButton', () => {
  it.each(['knob', 'plain'] as const)(
    'is a labelled button in the %s variant',
    (variant) => {
      const onPress = jest.fn();
      const tree = render(
        <IconButton
          icon={Bell}
          label="Notifications"
          variant={variant}
          onPress={onPress}
        />,
      );
      const button = pressable(tree, 'Notifications');
      expect(button.props.accessibilityRole).toBe('button');
      act(() => button.props.onPress());
      expect(onPress).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['md', 'h-11'],
    ['sm', 'h-[38px]'],
  ] as const)('sizes %s to %s and keeps a 44pt hit area', (size, expected) => {
    const tree = render(
      <IconButton icon={Bell} label="Bell" size={size} onPress={jest.fn()} />,
    );
    const button = pressable(tree, 'Bell');
    expect(String(button.props.className)).toContain(expected);
    const slop = size === 'sm' ? 6 : 0;
    expect(button.props.hitSlop).toBe(slop);
  });

  it('dims and reports disabled', () => {
    const tree = render(
      <IconButton icon={Bell} label="Bell" disabled onPress={jest.fn()} />,
    );
    const button = pressable(tree, 'Bell');
    expect(button.props.accessibilityState).toEqual({ disabled: true });
    expect(String(button.props.className)).toContain('opacity-50');
  });
});

describe('TintLink', () => {
  it('is a 44pt labelled button', () => {
    const onPress = jest.fn();
    const tree = render(
      <TintLink label="Add a service" icon={Bell} onPress={onPress} />,
    );
    const link = pressable(tree, 'Add a service');
    expect(String(link.props.className)).toContain('min-h-11');
    act(() => link.props.onPress());
    expect(onPress).toHaveBeenCalled();
  });
});

describe('InsetInput', () => {
  it('names the field for screen readers and shows leading and trailing content', () => {
    const tree = render(
      <InsetInput
        label="Name"
        placeholder="Name"
        leading={<>{'lead'}</>}
        trailing={<>{'trail'}</>}
      />,
    );
    expect(byLabel(tree, 'Name').length).toBeGreaterThan(0);
    expect(textOf(tree)).toContain('lead');
    expect(textOf(tree)).toContain('trail');
  });
});

describe('SearchField', () => {
  function setup(
    props: Partial<React.ComponentProps<typeof SearchField>> = {},
  ) {
    const onChangeText = jest.fn();
    const tree = render(
      <SearchField value="Zan" onChangeText={onChangeText} {...props} />,
    );
    return { tree, onChangeText };
  }

  it('defaults its label and placeholder to "Search"', () => {
    const { tree } = setup({ value: '' });
    expect(byLabel(tree, 'Search').length).toBeGreaterThan(0);
  });

  it('clears with the x inside the field', () => {
    const { tree, onChangeText } = setup();
    act(() => pressable(tree, 'Clear search').props.onPress());
    expect(onChangeText).toHaveBeenCalledWith('');
  });

  it('shows no clear button while empty', () => {
    const { tree } = setup({ value: '' });
    expect(byLabel(tree, 'Clear search')).toHaveLength(0);
  });

  it('clears with a Cancel link beside the field in the cancel variant', () => {
    const { tree, onChangeText } = setup({ clear: 'cancel' });
    act(() => pressable(tree, 'Cancel').props.onPress());
    expect(onChangeText).toHaveBeenCalledWith('');
    expect(byLabel(tree, 'Clear search')).toHaveLength(0);
  });
});

describe('inset fields', () => {
  it('labels the field with a caption and an accessibility label', () => {
    const tree = render(
      <LabeledInsetField label="Business name" defaultValue="Ashgrove" />,
    );
    expect(textOf(tree)).toContain('Business name');
    expect(byLabel(tree, 'Business name').length).toBeGreaterThan(0);
  });

  it('shows the currency symbol and reports typing', () => {
    const onChangeText = jest.fn();
    const tree = render(
      <AmountInsetField
        symbol="R"
        label="Price"
        value="250"
        onChangeText={onChangeText}
      />,
    );
    expect(textOf(tree)).toContain('R');
    const input = byLabel(tree, 'Price').find((n) => !!n.props.onChangeText)!;
    act(() => input.props.onChangeText('300'));
    expect(onChangeText).toHaveBeenCalledWith('300');
  });
});

describe('Switch', () => {
  it.each([true, false])('reports checked=%s and toggles', (checked) => {
    const onCheckedChange = jest.fn();
    const tree = render(
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        accessibilityLabel="Open"
      />,
    );
    const sw = pressable(tree, 'Open');
    expect(sw.props.accessibilityRole).toBe('switch');
    expect(sw.props.accessibilityState).toEqual({ checked, disabled: false });
    act(() => sw.props.onPress());
    expect(onCheckedChange).toHaveBeenCalledWith(!checked);
  });

  it('is inert when disabled', () => {
    const tree = render(
      <Switch
        checked
        disabled
        onCheckedChange={jest.fn()}
        accessibilityLabel="Open"
      />,
    );
    expect(pressable(tree, 'Open').props.disabled).toBe(true);
  });
});

describe('SwitchRow', () => {
  function row(variant: 'flat' | 'card', checked: boolean) {
    const onCheckedChange = jest.fn();
    const tree = render(
      <SwitchRow
        variant={variant}
        title="Open on Mondays"
        detail="09:00 to 17:00"
        checked={checked}
        onCheckedChange={onCheckedChange}
        control={<>{'control'}</>}
      />,
    );
    return { tree, onCheckedChange };
  }

  it('shows title, detail and control, and names the switch after the title', () => {
    const { tree, onCheckedChange } = row('flat', true);
    expect(textOf(tree)).toContain('Open on Mondays');
    expect(textOf(tree)).toContain('09:00 to 17:00');
    act(() => pressable(tree, 'Open on Mondays').props.onPress());
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it('dims the flat row when off but never the card', () => {
    const opacities = (variant: 'flat' | 'card') =>
      row(variant, false)
        .tree.root.findAll((n) => typeof n.type === 'string')
        .map(
          (n) => (n.props.style as { opacity?: number } | undefined)?.opacity,
        )
        .filter((o) => o !== undefined);
    expect(opacities('flat')).toContain(0.4);
    expect(opacities('card')).not.toContain(0.4);
  });
});

describe('SegmentedControl', () => {
  const options = [
    { value: 'day', label: 'Day', accessibilityLabel: 'Day view' },
    { value: 'week', label: 'Week' },
  ] as const;

  it('selects one tab and reports changes', () => {
    const onChange = jest.fn();
    const tree = render(
      <SegmentedControl
        label="View"
        value="day"
        onChange={onChange}
        options={options}
      />,
    );
    expect(byLabel(tree, 'View').length).toBeGreaterThan(0);
    expect(pressable(tree, 'Day view').props.accessibilityState.selected).toBe(
      true,
    );
    expect(pressable(tree, 'Week').props.accessibilityState.selected).toBe(
      false,
    );
    act(() => pressable(tree, 'Week').props.onPress());
    expect(onChange).toHaveBeenCalledWith('week');
  });

  it('uses the longer spoken label when given', () => {
    const tree = render(
      <SegmentedControl
        label="View"
        value="day"
        onChange={jest.fn()}
        options={options}
      />,
    );
    expect(pressable(tree, 'Day view')).toBeTruthy();
  });
});

describe('Chip and Chips', () => {
  it('uses radio semantics for filters and button semantics for times', () => {
    const filter = render(
      <Chip variant="filter" label="All" selected onPress={jest.fn()} />,
    );
    const time = render(
      <Chip label="10:30" selected={false} onPress={jest.fn()} />,
    );
    const f = pressable(filter, 'All');
    expect(f.props.accessibilityRole).toBe('radio');
    expect(f.props.accessibilityState).toEqual({
      selected: true,
      checked: true,
    });
    const t = pressable(time, '10:30');
    expect(t.props.accessibilityRole).toBe('button');
    expect(t.props.accessibilityState).toEqual({ selected: false });
  });

  it('paints a selected chip with the tactile tint and others raised', () => {
    const depth = getDepth('light');
    const shadow = (selected: boolean) => {
      const tree = render(
        <Chip label="10:30" selected={selected} onPress={jest.fn()} />,
      );
      const styled = tree.root
        .findAll(
          (n) => typeof n.type === 'string' && Array.isArray(n.props.style),
        )
        .flatMap((n) => n.props.style as { boxShadow?: string }[]);
      return styled.find((entry) => entry?.boxShadow)?.boxShadow;
    };
    expect(shadow(true)).toBe(depth.primary.boxShadow);
    expect(shadow(false)).toBe(depth.button.boxShadow);
  });

  it('renders a radiogroup of chips and reports the choice', () => {
    const onChange = jest.fn();
    const tree = render(
      <Chips
        label="Filter"
        value="all"
        onChange={onChange}
        options={[
          { value: 'all', label: 'All' },
          { value: 'vip', label: 'VIP' },
        ]}
      />,
    );
    expect(
      byLabel(tree, 'Filter').some(
        (n) => n.props.accessibilityRole === 'radiogroup',
      ),
    ).toBe(true);
    act(() => pressable(tree, 'VIP').props.onPress());
    expect(onChange).toHaveBeenCalledWith('vip');
  });
});

describe('ChoiceCard', () => {
  it('speaks title and subtitle together and reports selection', () => {
    const onPress = jest.fn();
    const tree = render(
      <ChoiceCard
        title="Hair salon"
        subtitle="Cuts and colour"
        selected
        onPress={onPress}
      />,
    );
    const card = pressable(tree, 'Hair salon. Cuts and colour');
    expect(card.props.accessibilityRole).toBe('radio');
    expect(card.props.accessibilityState).toEqual({ checked: true });
    act(() => card.props.onPress());
    expect(onPress).toHaveBeenCalled();
  });

  it('is unchecked when not selected', () => {
    const tree = render(
      <ChoiceCard title="Barber" selected={false} onPress={jest.fn()} />,
    );
    expect(pressable(tree, 'Barber').props.accessibilityState).toEqual({
      checked: false,
    });
  });
});
