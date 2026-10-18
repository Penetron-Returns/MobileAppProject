import { BLINK_GAP_MIN_MS, BLINK_STEP_MS } from '../spriteSchedule';
import { act, mount } from '@/testing/render';

import { ClovieSprite } from '../ClovieSprite';

let randomSpy: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  // Random 0 makes the first blink land exactly BLINK_GAP_MIN_MS after mount.
  randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
});
afterEach(() => {
  randomSpy.mockRestore();
  jest.clearAllTimers();
  jest.useRealTimers();
});

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
    act(() => tree.unmount());
  });

  it('keeps the open frame visible and schedules nothing when inactive', () => {
    const tree = mount(<ClovieSprite size={100} isActive={false} />);
    expect(opacityOf(tree, 'clovie-sprite')).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
    act(() => tree.unmount());
  });

  it('blinks by toggling overlay opacity while the open frame stays mounted', () => {
    const tree = mount(<ClovieSprite size={100} isActive />);
    act(() => {
      jest.advanceTimersByTime(BLINK_GAP_MIN_MS - 1);
    });
    expect(opacityOf(tree, 'clovie-sprite-blink-1')).toBe(0);
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(opacityOf(tree, 'clovie-sprite-blink-1')).toBe(1);
    act(() => {
      jest.advanceTimersByTime(BLINK_STEP_MS);
    });
    expect(opacityOf(tree, 'clovie-sprite-blink-1')).toBe(0);
    expect(opacityOf(tree, 'clovie-sprite-blink-2')).toBe(1);
    expect(opacityOf(tree, 'clovie-sprite')).toBe(1);
    act(() => tree.unmount());
  });
});
