import { zodResolver } from '@hookform/resolvers/zod';
import { PortalHost } from '@rn-primitives/portal';
import * as React from 'react';
import { useForm, type Control } from 'react-hook-form';
import { Pressable } from 'react-native';
import { z } from 'zod';

import { act, byLabel, pressable, render, textOf } from '../../testing/render';
import { FormField } from '../FormField';
import { GroupField } from '../GroupField';
import { OptionSheet } from '../OptionSheet';
import { DayChips, SlotSkeleton, TimeChips } from '../SlotPicker';
import { Toaster } from '../Toast';
import { clearToasts, dismissToast, showToast, useToasts } from '../toastStore';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

// Sheets portal into a host the test renderer does not have.
jest.mock('../Sheet', () => {
  const { View } = require('react-native');
  const Passthrough = ({ children }: { children?: unknown }) =>
    children ?? null;
  return {
    Sheet: ({ open, children }: { open: boolean; children?: unknown }) =>
      open ? children : null,
    SheetContent: Passthrough,
    SheetHeader: Passthrough,
    SheetTitle: View,
    SheetDescription: View,
  };
});

const schema = z.object({
  name: z.string().min(2, 'Enter at least 2 characters'),
});

type Values = { name: string };

function FormHarness({
  children,
}: {
  children: (control: Control<Values>) => React.ReactNode;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
  });
  return (
    <>
      {children(form.control)}
      <Pressable
        accessibilityLabel="submit"
        onPress={() => form.handleSubmit(() => undefined)()}
      />
    </>
  );
}

describe('GroupField', () => {
  it('labels the field and shows the validation error below it', async () => {
    const tree = render(
      <FormHarness>
        {(control) => (
          <GroupField control={control} name="name" label="Business name" />
        )}
      </FormHarness>,
    );
    expect(byLabel(tree, 'Business name').length).toBeGreaterThan(0);
    await act(async () => {
      await pressable(tree, 'submit').props.onPress();
    });
    expect(textOf(tree)).toContain('Enter at least 2 characters');
    expect(
      tree.root.find((n) => n.props.accessibilityRole === 'alert'),
    ).toBeTruthy();
  });

  it('writes typing back to the form', async () => {
    const tree = render(
      <FormHarness>
        {(control) => (
          <GroupField control={control} name="name" label="Business name" />
        )}
      </FormHarness>,
    );
    const input = byLabel(tree, 'Business name').find(
      (n) => !!n.props.onChangeText,
    )!;
    await act(async () => {
      input.props.onChangeText('Ashgrove');
    });
    await act(async () => {
      await pressable(tree, 'submit').props.onPress();
    });
    expect(textOf(tree)).not.toContain('Enter at least 2 characters');
  });
});

describe('FormField', () => {
  it('shows a hint until there is an error, then the error', async () => {
    const tree = render(
      <FormHarness>
        {(control) => (
          <FormField
            control={control}
            name="name"
            label="Name"
            hint="As on the door"
          />
        )}
      </FormHarness>,
    );
    expect(textOf(tree)).toContain('As on the door');
    await act(async () => {
      await pressable(tree, 'submit').props.onPress();
    });
    expect(textOf(tree)).toContain('Enter at least 2 characters');
    expect(textOf(tree)).not.toContain('As on the door');
  });

  it('renders a custom control when given one', () => {
    const tree = render(
      <FormHarness>
        {(control) => (
          <FormField
            control={control}
            name="name"
            render={() => <>{'custom control'}</>}
          />
        )}
      </FormHarness>,
    );
    expect(textOf(tree)).toContain('custom control');
  });
});

describe('OptionSheet', () => {
  const options = [
    { value: 'zar', label: 'Rand', description: 'ZAR' },
    { value: 'usd', label: 'Dollar' },
  ];

  function sheet(selected: string | null) {
    const onSelect = jest.fn();
    const onOpenChange = jest.fn();
    const tree = render(
      <>
        <OptionSheet
          open
          onOpenChange={onOpenChange}
          title="Currency"
          options={options}
          selected={selected}
          onSelect={onSelect}
        />
        <PortalHost />
      </>,
    );
    return { tree, onSelect, onOpenChange };
  }

  it('lists the options with their descriptions and marks the selected one', () => {
    const { tree } = sheet('zar');
    expect(textOf(tree)).toContain('Currency');
    expect(textOf(tree)).toContain('ZAR');
    const selected = tree.root.findAll(
      (n) => n.props.accessibilityState?.selected === true && !!n.props.onPress,
    );
    expect(selected.length).toBeGreaterThan(0);
  });

  it('selects an option and closes', () => {
    const { tree, onSelect, onOpenChange } = sheet('zar');
    const dollar = tree.root.find(
      (n) => !!n.props.onPress && textOf(n).includes('Dollar'),
    );
    act(() => dollar.props.onPress());
    expect(onSelect).toHaveBeenCalledWith('usd');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('toasts', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    act(() => clearToasts());
  });
  afterEach(() => jest.useRealTimers());

  function Probe({ onItems }: { onItems: (n: number) => void }) {
    onItems(useToasts().length);
    return null;
  }

  it('queues at most three toasts, newest last', () => {
    const seen: number[] = [];
    render(<Probe onItems={(n) => seen.push(n)} />);
    act(() => {
      for (const title of ['a', 'b', 'c', 'd']) {
        showToast({ kind: 'info', title });
      }
    });
    expect(seen[seen.length - 1]).toBe(3);
  });

  it('expires success after 4.5s and errors after 7s', () => {
    const seen: number[] = [];
    render(<Probe onItems={(n) => seen.push(n)} />);
    act(() => {
      showToast({ kind: 'success', title: 'Saved' });
      showToast({ kind: 'error', title: 'Failed' });
    });
    expect(seen[seen.length - 1]).toBe(2);
    act(() => jest.advanceTimersByTime(4500));
    expect(seen[seen.length - 1]).toBe(1);
    act(() => jest.advanceTimersByTime(2500));
    expect(seen[seen.length - 1]).toBe(0);
  });

  it('dismisses a toast by id', () => {
    let id = 0;
    act(() => {
      id = showToast({ kind: 'info', title: 'Hello' });
    });
    const tree = render(<Toaster />);
    expect(textOf(tree)).toContain('Hello');
    act(() => dismissToast(id));
    expect(textOf(tree)).not.toContain('Hello');
  });

  it('shows the reference of an error and an accessible dismiss button', () => {
    act(() => {
      showToast({
        kind: 'error',
        title: 'Could not save',
        description: 'Check your connection.',
        requestId: 'req_1',
      });
    });
    const tree = render(<Toaster />);
    expect(textOf(tree)).toContain('Reference: req_1');
    expect(
      tree.root.find((n) => n.props.accessibilityRole === 'alert'),
    ).toBeTruthy();
    expect(pressable(tree, 'Dismiss')).toBeTruthy();
  });
});

describe('slot picker kit', () => {
  const days = [
    {
      value: '2026-10-14',
      weekday: 'Wed',
      day: '14',
      accessibilityLabel: 'Wednesday 14 October',
    },
    {
      value: '2026-10-15',
      weekday: 'Thu',
      day: '15',
      accessibilityLabel: 'Thursday 15 October',
    },
  ];

  it('marks the selected day and reports a pick', () => {
    const onSelect = jest.fn();
    const tree = render(
      <DayChips
        days={days}
        selected="2026-10-14"
        onSelect={onSelect}
        label="Days"
      />,
    );
    expect(
      pressable(tree, 'Wednesday 14 October').props.accessibilityState,
    ).toEqual({ selected: true });
    expect(
      pressable(tree, 'Thursday 15 October').props.accessibilityState,
    ).toEqual({ selected: false });
    act(() => pressable(tree, 'Thursday 15 October').props.onPress());
    expect(onSelect).toHaveBeenCalledWith('2026-10-15');
  });

  it('renders the times as chips and reports a pick', () => {
    const onSelect = jest.fn();
    const tree = render(
      <TimeChips
        times={[
          { value: 't1', label: '10:00' },
          { value: 't2', label: '10:30' },
        ]}
        selected="t2"
        onSelect={onSelect}
        label="Times"
      />,
    );
    expect(byLabel(tree, 'Times').length).toBeGreaterThan(0);
    expect(pressable(tree, '10:30').props.accessibilityState).toEqual({
      selected: true,
    });
    act(() => pressable(tree, '10:00').props.onPress());
    expect(onSelect).toHaveBeenCalledWith('t1');
  });

  it('announces the loading skeleton as busy', () => {
    const tree = render(<SlotSkeleton label="Loading availability" />);
    const busy = byLabel(tree, 'Loading availability')[0];
    expect(busy.props.accessibilityState).toEqual({ busy: true });
  });
});
