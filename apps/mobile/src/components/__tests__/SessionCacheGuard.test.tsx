import * as React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import renderer, { act } from 'react-test-renderer';

import { queryClient } from '@/lib/query';
import { CACHE_SCOPE_KEY } from '@/lib/queryPersist';

import { SessionCacheGuard } from '../SessionCacheGuard';

const mockUseAuth = jest.fn();
jest.mock('@clerk/expo', () => ({ useAuth: () => mockUseAuth() }));

const key = ['clients', 'one', 'c-1'];

function render() {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<SessionCacheGuard />);
  });
  return tree;
}
const rerender = (tree: renderer.ReactTestRenderer) =>
  act(() => tree.update(<SessionCacheGuard />));

beforeEach(() => {
  queryClient.clear();
  mockUseAuth.mockReturnValue({ userId: 'u1', orgId: 'o1' });
});

describe('SessionCacheGuard', () => {
  it('clears cached business data when the session ends elsewhere', () => {
    const tree = render();
    queryClient.setQueryData(key, { name: 'Olivia' });
    mockUseAuth.mockReturnValue({ userId: null, orgId: null });
    rerender(tree);
    expect(queryClient.getQueryData(key)).toBeUndefined();
  });

  it('clears the cache when another user signs in', () => {
    const tree = render();
    queryClient.setQueryData(key, { name: 'Olivia' });
    mockUseAuth.mockReturnValue({ userId: 'u2', orgId: 'o2' });
    rerender(tree);
    expect(queryClient.getQueryData(key)).toBeUndefined();
  });

  it('keeps the cache while the same session stays active', () => {
    const tree = render();
    queryClient.setQueryData(key, { name: 'Olivia' });
    rerender(tree);
    expect(queryClient.getQueryData(key)).toEqual({ name: 'Olivia' });
  });
});

describe('SessionCacheGuard saved copy', () => {
  const flush = () => act(async () => void (await Promise.resolve()));

  it('drops a cache that was saved for another account', async () => {
    await AsyncStorage.setItem(CACHE_SCOPE_KEY, 'old-user:old-org');
    queryClient.setQueryData(key, { name: 'Someone else' });
    render();
    await flush();
    await flush();
    expect(queryClient.getQueryData(key)).toBeUndefined();
    expect(await AsyncStorage.getItem(CACHE_SCOPE_KEY)).toBe('u1:o1');
  });

  it('keeps the cache saved for the same account', async () => {
    await AsyncStorage.setItem(CACHE_SCOPE_KEY, 'u1:o1');
    queryClient.setQueryData(key, { name: 'Olivia' });
    render();
    await flush();
    await flush();
    expect(queryClient.getQueryData(key)).toEqual({ name: 'Olivia' });
  });

  it('clears the saved cache when launched signed out', async () => {
    queryClient.setQueryData(key, { name: 'Olivia' });
    mockUseAuth.mockReturnValue({ userId: null, orgId: null, isLoaded: true });
    render();
    await flush();
    expect(queryClient.getQueryData(key)).toBeUndefined();
  });
});
