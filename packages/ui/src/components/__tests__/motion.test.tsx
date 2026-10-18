import * as React from 'react';
import { AccessibilityInfo } from 'react-native';

import { resetReduceMotionForTests } from '../../theme/useReduceMotion';
import { act, render } from '../../testing/render';
import { Pressable } from '../../primitives/Pressable';
import { DURATION } from '../../tokens/motion';
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

describe('reduced motion', () => {
  beforeEach(resetReduceMotionForTests);
  afterEach(() => jest.restoreAllMocks());

  it('drops the press transition when the OS asks for reduced motion', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    let tree!: ReturnType<typeof render>;
    await act(async () => {
      tree = render(
        <Pressable accessibilityRole="button" feedback="nudge" testID="p" />,
      );
    });
    expect(styleOf(tree).transitionDuration).toBeUndefined();
    expect(styleOf(tree).transitionProperty).toBeUndefined();
  });

  it('animates the press with the press token otherwise', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    let tree!: ReturnType<typeof render>;
    await act(async () => {
      tree = render(
        <Pressable accessibilityRole="button" feedback="inset" testID="p" />,
      );
    });
    expect(styleOf(tree).transitionDuration).toBe(DURATION.press);
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
