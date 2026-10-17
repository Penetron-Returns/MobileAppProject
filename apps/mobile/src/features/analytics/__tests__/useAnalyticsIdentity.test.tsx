import * as React from 'react';

import { act, mount } from '@/testing/render';

import { setAnalytics } from '..';
import { createFakeAnalytics } from '../testing';
import { useAnalyticsIdentity } from '../useAnalyticsIdentity';

/** Renders the hook; `setBusiness` stands in for the business loading later. */
let setBusiness: (id: string | null) => void = () => undefined;
function Probe({ userId }: { userId: string | null }) {
  const [businessId, set] = React.useState<string | null>(null);
  setBusiness = set;
  useAnalyticsIdentity(userId, businessId);
  return null;
}

afterEach(() => setAnalytics());

describe('useAnalyticsIdentity', () => {
  it('stays anonymous until there is a signed-in user', () => {
    const fake = createFakeAnalytics();
    setAnalytics(fake);
    mount(<Probe userId={null} />);
    expect(fake.identified).toEqual([]);
    expect(fake.groups).toEqual([]);
  });

  it('identifies the user, then groups the business once it exists', () => {
    const fake = createFakeAnalytics();
    setAnalytics(fake);
    mount(<Probe userId="user_1" />);
    expect(fake.identified).toEqual(['user_1']);
    expect(fake.groups).toEqual([]);
    act(() => setBusiness('biz_1'));
    expect(fake.identified).toEqual(['user_1']);
    expect(fake.groups).toEqual([{ type: 'business', id: 'biz_1' }]);
  });
});
