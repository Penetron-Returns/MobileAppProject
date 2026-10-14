import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

import { queryClient } from '@/lib/query';

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
