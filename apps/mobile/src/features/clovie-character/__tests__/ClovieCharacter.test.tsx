import * as React from 'react';

import { act, mount } from '@/testing/render';

import { ClovieCharacter } from '../ClovieCharacter';

let mockReduce = false;
jest.mock('@booking/ui', () => ({
  ...jest.requireActual('@booking/ui'),
  useReduceMotion: () => mockReduce,
}));

beforeEach(() => {
  jest.useFakeTimers();
  mockReduce = false;
});
afterEach(() => {
  jest.useRealTimers();
});

const sprites = (tree: ReturnType<typeof mount>) =>
  tree.root.findAll(
    (n) => n.props.testID === 'clovie-sprite' && typeof n.type === 'string',
  );
const lids = (tree: ReturnType<typeof mount>) =>
  tree.root.findAll((n) => n.props.testID === 'clovie-lid');

describe('ClovieCharacter', () => {
  it('schedules nothing at rest', () => {
    mount(<ClovieCharacter emotion="delighted" isLive />);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('blinks on a timer only while the sprite is showing', () => {
    const tree = mount(<ClovieCharacter emotion="calm" isActive isLive />);
    expect(jest.getTimerCount()).toBeGreaterThan(0);
    act(() => tree.unmount());
    expect(jest.getTimerCount()).toBe(0);
  });

  it('draws the static image, with no eyelids and no sprite, when not active', () => {
    const tree = mount(<ClovieCharacter emotion="curious" isLive />);
    expect(sprites(tree)).toHaveLength(0);
    expect(lids(tree)).toHaveLength(0);
  });

  it('stays static while active unless live is asked for', () => {
    const tree = mount(<ClovieCharacter emotion="curious" isActive />);
    expect(sprites(tree)).toHaveLength(0);
  });

  it('draws the blinking companion sprite while active and live', () => {
    const tree = mount(<ClovieCharacter emotion="curious" isActive isLive />);
    expect(sprites(tree)).toHaveLength(1);
    expect(lids(tree)).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('shows only the static image with Reduce Motion on', () => {
    mockReduce = true;
    const tree = mount(<ClovieCharacter emotion="proud" isActive isLive />);
    expect(sprites(tree)).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('hides itself from screen readers', () => {
    const tree = mount(<ClovieCharacter emotion="sleepy" testID="clovie" />);
    const node = tree.root.findAll(
      (n) => n.props.testID === 'clovie' && typeof n.type === 'string',
    )[0];
    expect(node.props.accessibilityElementsHidden).toBe(true);
  });
});
