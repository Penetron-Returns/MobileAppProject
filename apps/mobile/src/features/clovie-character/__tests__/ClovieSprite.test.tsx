import { act, mount } from '@/testing/render';

import { ClovieSprite } from '../ClovieSprite';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const opacityOf = (tree: ReturnType<typeof mount>, id: string) => {
  const style = tree.root.findByProps({ testID: id }).props.style;
  return [style]
    .flat(3)
    .reduce((o, s) => (s && 'opacity' in s ? s.opacity : o), 1);
};

describe('ClovieSprite', () => {
  it('shows the open frame at full opacity before any onLoad fires', () => {
    const onLoad = jest.fn();
    const tree = mount(<ClovieSprite size={100} isActive onLoad={onLoad} />);
    expect(onLoad).not.toHaveBeenCalled();
    expect(opacityOf(tree, 'clovie-sprite')).toBe(1);
    expect(opacityOf(tree, 'clovie-sprite-blink-1')).toBe(0);
    expect(opacityOf(tree, 'clovie-sprite-blink-2')).toBe(0);
  });

  it('keeps the open frame visible and schedules nothing when inactive', () => {
    const tree = mount(<ClovieSprite size={100} isActive={false} />);
    expect(opacityOf(tree, 'clovie-sprite')).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('blinks by toggling overlay opacity while the open frame stays mounted', () => {
    const tree = mount(<ClovieSprite size={100} isActive />);
    let seen = false;
    for (let i = 0; i < 40 && !seen; i++) {
      act(() => {
        jest.advanceTimersByTime(100);
      });
      seen =
        opacityOf(tree, 'clovie-sprite-blink-2') === 1 ||
        opacityOf(tree, 'clovie-sprite-blink-1') === 1;
    }
    expect(seen).toBe(true);
    expect(opacityOf(tree, 'clovie-sprite')).toBe(1);
  });
});
