import * as React from 'react';
import { Text } from 'react-native';

import { mount } from '@/testing/render';

import { OnboardingShell } from '../components/OnboardingShell';

jest.mock('@clerk/expo', () => ({ useAuth: () => ({ isSignedIn: false }) }));
jest.mock('@/features/auth/useSignOut', () => ({
  useSignOut: () => jest.fn(),
}));

describe('OnboardingShell header', () => {
  it('shows the Clovie wordmark as a non-interactive image', () => {
    const tree = mount(
      <OnboardingShell>
        <Text>body</Text>
      </OnboardingShell>,
    );
    const node = tree.root.findByProps({ testID: 'onboarding-wordmark' });
    expect(node.props.accessibilityRole).toBe('image');
    expect(node.props.accessibilityLabel).toBe('Clovie');
    expect(node.props.pointerEvents).toBe('none');
    expect(
      tree.root.findAllByProps({ testID: 'clovie-wordmark' }).length,
    ).toBeGreaterThan(0);
  });

  it('keeps the progress dots when a stage is given', () => {
    const tree = mount(
      <OnboardingShell stage={2}>
        <Text>body</Text>
      </OnboardingShell>,
    );
    expect(
      tree.root.findAllByProps({ testID: 'dot-active' }).length,
    ).toBeGreaterThan(0);
  });
});
