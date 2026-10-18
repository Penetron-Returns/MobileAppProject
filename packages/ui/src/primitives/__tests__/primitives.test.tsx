import * as React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { getDepth } from '../../tokens/depth';
import { act, host, render, textOf } from '../../testing/render';
import { Divider } from '../Divider';
import { Ground } from '../Ground';
import { Pressable } from '../Pressable';
import { Skeleton } from '../Skeleton';
import { Surface, type SurfaceVariant } from '../Surface';
import { Text } from '../Text';

const flat = (style: unknown) =>
  (StyleSheet.flatten(style as StyleProp<ViewStyle>) ?? {}) as Record<
    string,
    unknown
  >;

describe('Text', () => {
  it.each([
    ['large-title', 'text-large-title'],
    ['section', 'text-section'],
    ['title', 'text-title'],
    ['subtitle', 'text-subtitle'],
    ['meta', 'text-meta'],
    ['button', 'font-semibold'],
  ] as const)('applies the %s step of the type scale', (variant, expected) => {
    const tree = render(<Text variant={variant}>Hello</Text>);
    const text = tree.root.findAll((n) => n.props.children === 'Hello').pop()!;
    expect(String(text.props.className ?? '')).toContain(expected);
  });

  it('marks h1 as a heading', () => {
    const tree = render(<Text variant="h1">Title</Text>);
    expect(tree.root.findByProps({ role: 'heading' })).toBeTruthy();
  });

  it('keeps a text colour class next to a type step', () => {
    const tree = render(
      <Text variant="subtitle" className="text-muted-foreground">
        Hello
      </Text>,
    );
    const className = String(
      tree.root.findAll((n) => n.props.children === 'Hello').pop()!.props
        .className,
    );
    expect(className).toContain('text-subtitle');
    expect(className).toContain('text-muted-foreground');
  });
});

describe('Surface', () => {
  it.each([
    ['raised', 22],
    ['hero', 26],
    ['floating', 32],
    ['inset', 24],
  ] as [SurfaceVariant, number][])(
    'gives %s its depth shadow and a %i radius',
    (variant, radius) => {
      const tree = render(<Surface variant={variant} testID="s" />);
      const style = flat(host(tree, 's').props.style);
      expect(style.boxShadow).toBe(getDepth('light')[variant].boxShadow);
      expect(style.borderRadius).toBe(radius);
    },
  );

  it('lets radius override the variant default', () => {
    const tree = render(<Surface variant="dome" radius={40} testID="s" />);
    expect(flat(host(tree, 's').props.style).borderRadius).toBe(40);
  });

  it('follows the dark scheme', () => {
    const tree = render(<Surface variant="raised" testID="s" />, 'dark');
    expect(flat(host(tree, 's').props.style).boxShadow).toBe(
      getDepth('dark').raised.boxShadow,
    );
  });
});

describe('Ground', () => {
  it('paints the ground gradient', () => {
    const tree = render(<Ground testID="g" />);
    expect(flat(host(tree, 'g').props.style).backgroundColor).toBe(
      getDepth('light').ground.backgroundColor,
    );
  });
});

describe('Divider', () => {
  it.each([16, 50, 72] as const)('insets %i points', (inset) => {
    const tree = render(<Divider inset={inset} />);
    expect(JSON.stringify(tree.toJSON())).toBeTruthy();
    const surface = tree.root.findByType(Surface);
    expect(surface.props.style).toEqual({ left: inset, height: 2 });
    // Two solid 1px lines: the shadow over the highlight.
    expect(surface.props.children).toHaveLength(2);
  });
});

describe('Pressable', () => {
  function pressedStyle(
    feedback: 'dim' | 'inset' | 'nudge' | 'none',
    pressed: boolean,
  ) {
    const tree = render(
      <Pressable accessibilityRole="button" feedback={feedback} testID="p" />,
    );
    const press = tree.root.find(
      (n) => typeof n.type !== 'string' && n.props.onPressIn !== undefined,
    );
    if (pressed) act(() => press.props.onPressIn({}));
    const node = tree.root.find(
      (n) => n.props.testID === 'p' && typeof n.props.style === 'object',
    );
    return flat(node.props.style);
  }

  it('dims while pressed', () => {
    expect(pressedStyle('dim', true).opacity).toBe(0.6);
    expect(pressedStyle('dim', false).opacity).toBeUndefined();
  });

  it('presses the surface in', () => {
    expect(pressedStyle('inset', true).boxShadow).toBe(
      getDepth('light').buttonPressed.boxShadow,
    );
  });

  it('gives nudge and inset presses a UI-thread transform, and dim none', () => {
    // The pose itself is a Reanimated shared value (not evaluated under Jest):
    // the style carries the transform slots it drives.
    expect(pressedStyle('nudge', true).transform).toEqual([
      { translateY: expect.any(Number) },
      { scale: expect.any(Number) },
    ]);
    expect(pressedStyle('inset', true).transform).toEqual([
      { translateY: expect.any(Number) },
      { scale: expect.any(Number) },
    ]);
    expect(pressedStyle('dim', true).transform).toBeUndefined();
  });

  it('leaves feedback to the caller with none', () => {
    expect(pressedStyle('none', true).opacity).toBeUndefined();
  });
});

describe('Skeleton', () => {
  it('renders a placeholder that forwards className', () => {
    const tree = render(<Skeleton className="h-4 w-1/2" testID="k" />);
    expect(String(host(tree, 'k').props.className)).toContain('bg-accent');
    expect(String(host(tree, 'k').props.className)).not.toContain(
      'animate-pulse',
    );
    expect(textOf(tree)).toBe('');
  });
});
