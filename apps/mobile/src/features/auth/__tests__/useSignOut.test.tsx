import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

import '@/lib/i18n';
import { queryClient } from '@/lib/query';

import { useSignOut } from '../useSignOut';

const mockSignOut = jest.fn();
jest.mock('@clerk/expo', () => ({
  useClerk: () => ({ signOut: mockSignOut }),
  useAuth: jest.fn(),
}));

function mountSignOut() {
  const ref: { current: (() => Promise<void>) | null } = { current: null };
  function Probe() {
    ref.current = useSignOut();
    return null;
  }
  act(() => {
    renderer.create(<Probe />);
  });
  return ref as { current: () => Promise<void> };
}

beforeEach(() => {
  mockSignOut.mockReset();
  queryClient.clear();
  queryClient.setQueryData(['appointments', 'one', 'a-1'], {
    client: 'Olivia',
  });
});

describe('useSignOut', () => {
  it('empties the query cache once Clerk has signed out', async () => {
    mockSignOut.mockResolvedValue(undefined);
    const signOut = mountSignOut();
    await act(async () => {
      await signOut.current();
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('keeps the cache when sign-out fails, since the session is still live', async () => {
    mockSignOut.mockRejectedValue(new Error('network'));
    const signOut = mountSignOut();
    await act(async () => {
      await signOut.current();
    });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
  });
});
