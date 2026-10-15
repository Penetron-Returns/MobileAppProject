import { AccessibilityInfo } from 'react-native';

import { act, render } from '../../testing/render';
import { AnimatedNumber } from '../AnimatedNumber';

const money = (cents: number) => `R${(cents / 100).toFixed(0)}`;

function textNode(tree: ReturnType<typeof render>) {
  return tree.root.find((n) => n.props.accessibilityLabel !== undefined);
}

describe('AnimatedNumber', () => {
  afterEach(() => jest.restoreAllMocks());

  it('labels the final value from the first frame, while the shown text counts', () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    const tree = render(<AnimatedNumber value={125000} format={money} />);
    const node = textNode(tree);
    expect(node.props.accessibilityLabel).toBe('R1250');
    expect(node.props.children).toBe('R0');
    expect(node.props.style).toEqual(
      expect.arrayContaining([{ fontVariant: ['tabular-nums'] }]),
    );
  });

  it('shows the final value at once under reduced motion', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    let tree!: ReturnType<typeof render>;
    await act(async () => {
      tree = render(<AnimatedNumber value={125000} format={money} />);
    });
    const node = textNode(tree);
    expect(node.props.children).toBe('R1250');
    expect(node.props.accessibilityLabel).toBe('R1250');
  });
});
