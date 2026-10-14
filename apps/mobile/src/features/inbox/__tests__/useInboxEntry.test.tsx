import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockHas = jest.fn();
jest.mock('@/features/plans/hooks', () => ({
  useEntitlements: () => ({ has: mockHas }),
}));

const mockUseQuery = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

import { useInboxEntry, type InboxEntry } from '../useInboxEntry';

function readEntry(): InboxEntry {
  let entry!: InboxEntry;
  function Probe() {
    entry = useInboxEntry();
    return null;
  }
  act(() => {
    renderer.create(<Probe />);
  });
  return entry;
}

describe('useInboxEntry', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is hidden with no badge when the plan lacks inbox (or entitlements are loading)', () => {
    mockHas.mockReturnValue(false);
    mockUseQuery.mockReturnValue({ data: 5 });
    expect(readEntry()).toEqual({ isVisible: false, unreadCount: 0 });
    expect(mockUseQuery.mock.calls[0][0]).toMatchObject({ enabled: false });
  });

  it('is visible with the open escalation count when the plan has inbox', () => {
    mockHas.mockReturnValue(true);
    mockUseQuery.mockReturnValue({ data: 3 });
    expect(readEntry()).toEqual({ isVisible: true, unreadCount: 3 });
    expect(mockHas).toHaveBeenCalledWith('inbox');
    expect(mockUseQuery.mock.calls[0][0]).toMatchObject({ enabled: true });
  });

  it('shows no badge until the count has loaded', () => {
    mockHas.mockReturnValue(true);
    mockUseQuery.mockReturnValue({ data: undefined });
    expect(readEntry()).toEqual({ isVisible: true, unreadCount: 0 });
  });
});
