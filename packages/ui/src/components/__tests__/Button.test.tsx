import * as React from 'react';
import { ActivityIndicator } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { Button } from '../Button';
import { Text } from '../../primitives/Text';

function renderButton(props: React.ComponentProps<typeof Button>) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <Button {...props}>
        <Text>Press me</Text>
      </Button>,
    );
  });
  return tree;
}

/** NativeWind wraps `Pressable` for `className` support, so match on the
 * `accessibilityRole="button"` prop the component sets rather than on the
 * (wrapped) component identity. */
function findButtonNode(tree: renderer.ReactTestRenderer) {
  return tree.root.findByProps({ accessibilityRole: 'button' });
}

describe('Button', () => {
  it('renders its label', () => {
    const tree = renderButton({});
    const text = tree.root.findByType(Text as never);
    expect(text.props.children).toBe('Press me');
  });

  it.each([
    'default',
    'secondary',
    'outline',
    'destructive',
    'ghost',
    'link',
    'whatsapp',
    'neutral',
    'soft',
    'outline-primary',
    'outline-destructive',
  ] as const)('renders the %s variant with the button role', (variant) => {
    const tree = renderButton({ variant });
    expect(findButtonNode(tree)).toBeTruthy();
  });

  it('applies the disabled style and prop when disabled', () => {
    const tree = renderButton({ disabled: true });
    const button = findButtonNode(tree);
    expect(button.props.disabled).toBe(true);
    expect(button.props.className).toEqual(
      expect.stringContaining('opacity-50'),
    );
  });

  it('fires onPress', () => {
    const onPress = jest.fn();
    const tree = renderButton({ onPress });
    act(() => {
      findButtonNode(tree).props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['sm', 'h-9'],
    ['default', 'h-11'],
    ['lg', 'h-[52px]'],
    ['xl', 'h-14'],
    ['icon', 'w-11'],
  ] as const)('sizes %s as %s', (size, expected) => {
    const tree = renderButton({ size });
    expect(findButtonNode(tree).props.className).toEqual(
      expect.stringContaining(expected),
    );
  });

  it('widens the small button hit area so it reaches 44pt', () => {
    // 36pt tall + 4pt of slop above and below.
    expect(findButtonNode(renderButton({ size: 'sm' })).props.hitSlop).toEqual({
      top: 4,
      bottom: 4,
    });
    expect(
      findButtonNode(renderButton({ size: 'default' })).props.hitSlop,
    ).toBeUndefined();
  });

  it('is busy and blocks presses while loading, without dimming', () => {
    const tree = renderButton({ loading: true });
    const button = findButtonNode(tree);
    expect(button.props.disabled).toBe(true);
    expect(button.props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
    expect(String(button.props.className)).not.toContain('opacity-50');
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(1);
  });

  it('shows no spinner when idle', () => {
    expect(renderButton({}).root.findAllByType(ActivityIndicator)).toHaveLength(
      0,
    );
  });
});
