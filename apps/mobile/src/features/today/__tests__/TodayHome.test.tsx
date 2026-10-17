import * as React from 'react';

import { mount, text } from '@/testing/render';

import { TodayHome } from '../components/TodayHome';

let mockEntitlements = { isLoading: false };
jest.mock('@/features/plans/hooks', () => ({
  useEntitlements: () => mockEntitlements,
}));
jest.mock('@/features/clovie-tab/components/ClovieTabScreen', () => {
  const { Text } = require('react-native');
  return { ClovieTabScreen: () => <Text>clovie tab</Text> };
});

describe('TodayHome', () => {
  it('shows the Clovie tab once the plan has loaded', () => {
    mockEntitlements = { isLoading: false };
    expect(text(mount(<TodayHome />))).toContain('clovie tab');
  });

  it('shows nothing while the plan is still loading', () => {
    mockEntitlements = { isLoading: true };
    expect(text(mount(<TodayHome />))).not.toContain('clovie tab');
  });
});
