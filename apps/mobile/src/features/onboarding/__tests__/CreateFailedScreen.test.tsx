import * as React from 'react';

import { mount, pressableByLabel, text } from '@/testing/render';

import { CreateFailedScreen } from '../components/CreateFailedScreen';

jest.mock('@clerk/expo', () => ({ useAuth: () => ({ isSignedIn: true }) }));
jest.mock('@/features/auth/useSignOut', () => ({
  useSignOut: () => jest.fn(),
}));
jest.mock('@/features/brand/ClovieAnimated', () => ({
  ClovieAnimated: () => null,
}));

describe('CreateFailedScreen', () => {
  it('create mode has no Back', () => {
    const tree = mount(
      <CreateFailedScreen error={new Error('x')} onRetry={jest.fn()} />,
    );
    expect(text(tree)).toContain("Couldn't create your business");
    expect(
      tree.root.findAll((n) => n.props.accessibilityLabel === 'Back'),
    ).toHaveLength(0);
  });

  it('revise mode says the change failed and offers a way back', () => {
    const onBack = jest.fn();
    const tree = mount(
      <CreateFailedScreen
        mode="revise"
        error={new Error('x')}
        onRetry={jest.fn()}
        onBack={onBack}
      />,
    );
    expect(text(tree)).toContain("Couldn't save the change");
    pressableByLabel(tree, 'Back').props.onPress();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
