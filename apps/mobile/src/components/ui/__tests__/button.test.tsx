import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

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
});
