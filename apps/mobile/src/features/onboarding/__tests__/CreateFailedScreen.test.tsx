import * as React from 'react';

import { mount, text } from '@/testing/render';

import { CreateFailedScreen } from '../components/CreateFailedScreen';

jest.mock('@clerk/expo', () => ({ useAuth: () => ({ isSignedIn: true }) }));
jest.mock('@/features/auth/useSignOut', () => ({
  useSignOut: () => jest.fn(),
}));

describe('CreateFailedScreen', () => {
  it('has no Back', () => {
    const tree = mount(
      <CreateFailedScreen error={new Error('x')} onRetry={jest.fn()} />,
    );
    expect(text(tree)).toContain("Couldn't create your business");
    expect(
      tree.root.findAll((n) => n.props.accessibilityLabel === 'Back'),
    ).toHaveLength(0);
  });
});
