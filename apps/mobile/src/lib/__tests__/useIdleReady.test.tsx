import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

import { useIdleReady } from '../useIdleReady';

function Probe({ onValue }: { onValue: (v: boolean) => void }) {
  onValue(useIdleReady(500));
  return null;
}

describe('useIdleReady', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('is false at first and true after idle plus the delay', () => {
    const seen: boolean[] = [];
    act(() => {
      renderer.create(<Probe onValue={(v) => seen.push(v)} />);
    });
    expect(seen.at(-1)).toBe(false);
    act(() => void jest.advanceTimersByTime(0));
    expect(seen.at(-1)).toBe(false);
    act(() => void jest.advanceTimersByTime(500));
    expect(seen.at(-1)).toBe(true);
  });
});
