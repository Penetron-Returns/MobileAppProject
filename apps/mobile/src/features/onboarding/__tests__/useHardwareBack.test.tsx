import * as React from 'react';
import { BackHandler } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { useHardwareBack } from '../useHardwareBack';

function Probe({ onBack }: { onBack: (() => void) | null | undefined }) {
  useHardwareBack(onBack);
  return null;
}

type Listener = () => boolean;
let listener: Listener | null;
let removed: boolean;
beforeEach(() => {
  listener = null;
  removed = false;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, l) => {
    listener = l as Listener;
    return {
      remove: () => {
        removed = true;
      },
    };
  });
});
afterEach(() => jest.restoreAllMocks());

describe('useHardwareBack', () => {
  it('runs the handler and consumes the event', () => {
    const onBack = jest.fn();
    act(() => void renderer.create(<Probe onBack={onBack} />));
    expect(listener?.()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('consumes Back without acting when given null, so the app does not exit', () => {
    act(() => void renderer.create(<Probe onBack={null} />));
    expect(listener?.()).toBe(true);
  });

  it('leaves the default behaviour alone when undefined', () => {
    act(() => void renderer.create(<Probe onBack={undefined} />));
    expect(listener).toBeNull();
  });

  it('calls the latest handler and unsubscribes on unmount', () => {
    const first = jest.fn();
    const second = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Probe onBack={first} />);
    });
    act(() => tree.update(<Probe onBack={second} />));
    listener?.();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
    expect(removed).toBe(true);
  });
});
