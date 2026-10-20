import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

import { useUserScopedState } from '../useUserScopedState';

function setup(initialUser: string | null) {
  const out = {} as { value: boolean; set: (v: boolean) => void };
  function Probe({ userId }: { userId: string | null }) {
    const [value, set] = useUserScopedState(userId, false);
    out.value = value;
    out.set = set;
    return null;
  }
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Probe userId={initialUser} />);
  });
  return {
    out,
    rerender: (userId: string | null) =>
      act(() => tree.update(<Probe userId={userId} />)),
  };
}

describe('useUserScopedState', () => {
  it('keeps the value for the same user', () => {
    const { out, rerender } = setup('u1');
    act(() => out.set(true));
    expect(out.value).toBe(true);
    rerender('u1');
    expect(out.value).toBe(true);
  });

  it('resets on sign-out and for another user', () => {
    const { out, rerender } = setup('u1');
    act(() => out.set(true));
    rerender(null);
    expect(out.value).toBe(false);
    rerender('u1');
    expect(out.value).toBe(true);
    rerender('u2');
    expect(out.value).toBe(false);
  });
});
