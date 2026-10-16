import * as React from 'react';

import { mount, text } from '@/testing/render';

import { TodayHome } from '../components/TodayHome';

let mockEntitlements = { isLoading: false, has: (_feature: string) => false };
jest.mock('@/features/plans/hooks', () => ({
  useEntitlements: () => mockEntitlements,
}));
jest.mock('../components/TodayScreen', () => {
  const { Text } = require('react-native');
  return { TodayScreen: () => <Text>classic today</Text> };
});
jest.mock('../components/TodayAiScreen', () => {
  const { Text } = require('react-native');
  return { TodayAiScreen: () => <Text>ai today</Text> };
});

describe('TodayHome', () => {
  it('keeps the classic Today for plans without the companion', () => {
    mockEntitlements = { isLoading: false, has: () => false };
    const out = text(mount(<TodayHome />));
    expect(out).toContain('classic today');
    expect(out).not.toContain('ai today');
  });

  it('shows the AI home for plans with the companion', () => {
    mockEntitlements = { isLoading: false, has: (f) => f === 'companion' };
    const out = text(mount(<TodayHome />));
    expect(out).toContain('ai today');
    expect(out).not.toContain('classic today');
  });

  it('shows neither while the plan is still loading', () => {
    mockEntitlements = { isLoading: true, has: () => false };
    const out = text(mount(<TodayHome />));
    expect(out).not.toContain('today');
  });
});
