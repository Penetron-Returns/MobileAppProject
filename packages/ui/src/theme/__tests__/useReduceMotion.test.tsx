import * as React from 'react';
import { AccessibilityInfo } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import * as mod from '../useReduceMotion';

describe('useReduceMotion store', () => {
  it('reads the OS setting once and updates every reader on change', async () => {
    const emitters: ((v: boolean) => void)[] = [];
    const isEnabled = jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
      _: string,
      cb: (v: boolean) => void,
    ) => {
      emitters.push(cb);
      return { remove: () => {} };
    }) as never);

    mod.resetReduceMotionForTests();
    const a: boolean[] = [];
    const b: boolean[] = [];
    function A() {
      a.push(mod.useReduceMotion());
      return null;
    }
    function B() {
      b.push(mod.useReduceMotion());
      return null;
    }
    await act(async () => {
      renderer.create(
        <>
          <A />
          <B />
        </>,
      );
    });
    expect(isEnabled).toHaveBeenCalled();
    expect(a.at(-1)).toBe(true);
    expect(b.at(-1)).toBe(true);
    act(() => emitters.forEach((emit) => emit(false)));
    expect(a.at(-1)).toBe(false);
    expect(b.at(-1)).toBe(false);
  });
});
