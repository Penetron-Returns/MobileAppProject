import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

import '@/lib/i18n';
import { queryClient } from '@/lib/query';

import { useSignOut } from '../useSignOut';

const mockSignOut = jest.fn();
const mockUnregisterPush = jest.fn();
jest.mock('@/features/notifications/pushDevice', () => ({
  unregisterPushToken: () => mockUnregisterPush(),
}));
const mockClearStorage = jest.fn();
jest.mock('@/features/onboarding/storage', () => ({
  clearOnboardingStorage: () => mockClearStorage(),
}));
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
  mockUnregisterPush.mockReset().mockResolvedValue(undefined);
  mockClearStorage.mockReset().mockResolvedValue(undefined);
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

  it('forgets the onboarding draft and type once signed out', async () => {
    mockSignOut.mockResolvedValue(undefined);
    const signOut = mountSignOut();
    await act(async () => {
      await signOut.current();
    });
    expect(mockClearStorage).toHaveBeenCalledTimes(1);
  });

  it('keeps the draft when sign-out fails', async () => {
    mockSignOut.mockRejectedValue(new Error('network'));
    const signOut = mountSignOut();
    await act(async () => {
      await signOut.current();
    });
    expect(mockClearStorage).not.toHaveBeenCalled();
  });

  it('stops pushes to this phone before the session ends', async () => {
    const order: string[] = [];
    mockUnregisterPush.mockImplementation(
      async () => void order.push('unregister'),
    );
    mockSignOut.mockImplementation(async () => void order.push('signOut'));
    const signOut = mountSignOut();
    await act(async () => {
      await signOut.current();
    });
    expect(order).toEqual(['unregister', 'signOut']);
  });

  it('still signs out when the push cleanup fails', async () => {
    mockUnregisterPush.mockRejectedValue(new Error('offline'));
    mockSignOut.mockResolvedValue(undefined);
    const signOut = mountSignOut();
    await act(async () => {
      await signOut.current();
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
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
