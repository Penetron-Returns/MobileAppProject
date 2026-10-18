import * as React from 'react';
import { StyleSheet } from 'react-native';

import { act, render } from '../../testing/render';
import { Pressable } from '../../primitives/Pressable';
import { Reveal } from '../Reveal';
import { Switch } from '../Switch';
import { Turn } from '../Turn';
import { Text } from '../../primitives/Text';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

function styleOf(tree: ReturnType<typeof render>) {
  const node = tree.root.find(
    (n) => n.props.testID === 'p' && typeof n.props.style === 'object',
  );
  return node.props.style as Record<string, unknown>;
}

describe('Pressable press feedback', () => {
  const flatStyle = (tree: ReturnType<typeof render>) => {
    return (StyleSheet.flatten(node(tree).props.style) ?? {}) as Record<
      string,
      unknown
    >;
  };
  const node = (tree: ReturnType<typeof render>) =>
    tree.root
      .findAll((n) => n.props.testID === 'p' && n.props.onPressIn !== undefined)
      .at(-1)!;

  it('dims while pressed and restores on release, forwarding the caller handlers', () => {
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    const tree = render(
      <Pressable
        accessibilityRole="button"
        testID="p"
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      />,
    );
    expect(flatStyle(tree).opacity).toBeUndefined();
    act(() => node(tree).props.onPressIn({}));
    expect(flatStyle(tree).opacity).toBe(0.6);
    expect(onPressIn).toHaveBeenCalledTimes(1);
    act(() => node(tree).props.onPressOut({}));
    expect(flatStyle(tree).opacity).toBeUndefined();
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  it('a nudge press does not re-render the component', () => {
    let renders = 0;
    const Probe = () => {
      renders += 1;
      return null;
    };
    const tree = render(
      <Pressable accessibilityRole="button" feedback="nudge" testID="p">
        <Probe />
      </Pressable>,
    );
    const before = renders;
    act(() => node(tree).props.onPressIn({}));
    act(() => node(tree).props.onPressOut({}));
    expect(renders).toBe(before);
  });
});

describe('motion components render their content', () => {
  it('Reveal shows its children, animated first time and still afterwards', () => {
    const first = render(
      <Reveal scope="t-first" index={0}>
        <Text>row</Text>
      </Reveal>,
    );
    expect(first.root.findAll((n) => n.children.includes('row')).length).toBe(
      1,
    );
    const second = render(
      <Reveal scope="t-first" index={1}>
        <Text>row</Text>
      </Reveal>,
    );
    expect(second.root.findAll((n) => n.children.includes('row')).length).toBe(
      1,
    );
  });

  it('Turn keeps the turning on a wrapping view, hidden from screen readers', () => {
    const tree = render(
      <Turn open>
        <Text>chevron</Text>
      </Turn>,
    );
    const wrapper = tree.root.find(
      (n) => n.props.importantForAccessibility === 'no-hide-descendants',
    );
    expect(wrapper.props.style.transform[0].rotate).toBe('180deg');
  });

  it('Switch thumb sits at the end when checked', () => {
    const tree = render(
      <Switch checked onCheckedChange={jest.fn()} accessibilityLabel="Open" />,
    );
    const moved = tree.root.findAll(
      (n) =>
        typeof n.type === 'string' &&
        Array.isArray(n.props.style) &&
        n.props.style.some(
          (s: { transform?: { translateX?: number }[] }) =>
            s?.transform?.[0]?.translateX === 20,
        ),
    );
    expect(moved.length).toBeGreaterThan(0);
  });
});
