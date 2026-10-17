import * as React from 'react';

import { act, mount } from '@/testing/render';

import {
  ClovieCharacter,
  type ClovieCharacterHandle,
} from '../ClovieCharacter';

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

describe('ClovieCharacter', () => {
  it('schedules nothing at rest', () => {
    mount(<ClovieCharacter emotion="delighted" blink="auto" />);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('runs the randomised blink timer only while active', () => {
    const tree = mount(
      <ClovieCharacter emotion="curious" blink="auto" isActive />,
    );
    expect(jest.getTimerCount()).toBeGreaterThan(0);
    act(() => tree.unmount());
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not run a blink timer in event or off mode', () => {
    mount(<ClovieCharacter emotion="curious" blink="event" isActive />);
    mount(<ClovieCharacter emotion="curious" blink="off" isActive />);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('keeps a static pose and never blinks with Reduce Motion on', () => {
    mockReduce = true;
    const ref = React.createRef<ClovieCharacterHandle>();
    mount(<ClovieCharacter ref={ref} emotion="proud" blink="auto" isActive />);
    expect(jest.getTimerCount()).toBe(0);
    expect(() => ref.current?.blinkOnce()).not.toThrow();
    act(() => {
      jest.advanceTimersByTime(20000);
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('exposes blinkOnce for event mode', () => {
    const ref = React.createRef<ClovieCharacterHandle>();
    mount(<ClovieCharacter ref={ref} emotion="calm" blink="event" />);
    expect(() => ref.current?.blinkOnce()).not.toThrow();
  });

  it('hides itself from screen readers', () => {
    const tree = mount(<ClovieCharacter emotion="sleepy" testID="clovie" />);
    const node = tree.root.findAll(
      (n) => n.props.testID === 'clovie' && typeof n.type === 'string',
    )[0];
    expect(node.props.accessibilityElementsHidden).toBe(true);
  });
});
