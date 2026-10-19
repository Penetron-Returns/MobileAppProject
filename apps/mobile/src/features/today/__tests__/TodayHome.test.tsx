import * as React from 'react';

import { mount, text } from '@/testing/render';

import { TodayHome } from '../components/TodayHome';

let mockEntitlements = { isLoading: false, hasClovie: true };
const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
}));
jest.mock('@/features/plans/hooks', () => ({
  useEntitlements: () => mockEntitlements,
}));
jest.mock('@/features/clovie-tab/components/ClovieTabScreen', () => {
  const { Text } = require('react-native');
  return { ClovieTabScreen: () => <Text>clovie tab</Text> };
});

beforeEach(() => mockRedirect.mockClear());

describe('TodayHome', () => {
  it('shows the Clovie tab once the plan has loaded', () => {
    mockEntitlements = { isLoading: false, hasClovie: true };
    expect(text(mount(<TodayHome />))).toContain('clovie tab');
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('sends Free, which has no Clovie tab, to the Calendar', () => {
    mockEntitlements = { isLoading: false, hasClovie: false };
    expect(text(mount(<TodayHome />))).not.toContain('clovie tab');
    expect(mockRedirect).toHaveBeenCalledWith('/calendar');
  });

  it('shows nothing while the plan is still loading', () => {
    mockEntitlements = { isLoading: true, hasClovie: false };
    expect(text(mount(<TodayHome />))).not.toContain('clovie tab');
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
