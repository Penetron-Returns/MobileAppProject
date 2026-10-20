import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

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

  it('badges the open escalation count', () => {
    mockUseQuery.mockReturnValue({ data: 3 });
    expect(readEntry()).toEqual({ unreadCount: 3 });
  });

  it('shows no badge until the count has loaded', () => {
    mockUseQuery.mockReturnValue({ data: undefined });
    expect(readEntry()).toEqual({ unreadCount: 0 });
  });
});
