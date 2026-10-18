import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

import { PLAY_MS, usePlayOnce } from '../usePlayOnce';

const mockWithTiming = jest.fn((value: number) => value);
const mockWithRepeat = jest.fn((value: unknown) => value);
const mockWithDelay = jest.fn((_delay: number, value: unknown) => value);
jest.mock('react-native-reanimated', () => {
  const base = require('../../../../testing/reanimatedMock');
  return {
    ...base,
    withTiming: (...a: [number]) => mockWithTiming(...a),
    withRepeat: (...a: [unknown]) => mockWithRepeat(...a),
    withDelay: (...a: [number, unknown]) => mockWithDelay(...a),
  };
});

let mockReduceMotion = false;
jest.mock('@booking/ui', () => ({
  useReduceMotion: () => mockReduceMotion,
}));
jest.mock('expo-router', () => ({
  // A focused screen: run the effect on mount, clean up on unmount.
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    require('react').useEffect(effect, [effect]);
  },
}));

function mount(delayMs?: number) {
  const out: { current?: ReturnType<typeof usePlayOnce> } = {};
  function Probe() {
    out.current = usePlayOnce(delayMs);
    return null;
  }
  act(() => {
    renderer.create(<Probe />);
  });
  return out as { current: ReturnType<typeof usePlayOnce> };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReduceMotion = false;
});

describe('usePlayOnce', () => {
  it('plays the scene once when the screen is focused, and never loops', () => {
    const run = mount();
    expect(mockWithTiming).toHaveBeenCalledTimes(1);
    expect(mockWithTiming.mock.calls[0]).toEqual([
      1,
      expect.objectContaining({ duration: PLAY_MS }),
    ]);
    expect(mockWithRepeat).not.toHaveBeenCalled();
    expect(run.current.progress.value).toBe(1);
  });

  it('staggers the first play by the given delay', () => {
    mount(280);
    expect(mockWithDelay).toHaveBeenCalledWith(280, expect.anything());
  });

  it('replays once, without delay, when tapped', () => {
    const run = mount(280);
    act(() => run.current.play());
    expect(mockWithTiming).toHaveBeenCalledTimes(2);
    expect(mockWithDelay).toHaveBeenLastCalledWith(0, expect.anything());
    expect(mockWithRepeat).not.toHaveBeenCalled();
  });

  it('shows only the finished frame under Reduce Motion', () => {
    mockReduceMotion = true;
    const run = mount();
    act(() => run.current.play());
    expect(mockWithTiming).not.toHaveBeenCalled();
    expect(run.current.progress.value).toBe(1);
  });
});
