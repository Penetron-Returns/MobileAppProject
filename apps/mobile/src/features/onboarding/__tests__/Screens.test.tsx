import * as React from 'react';

import { act, mount, pressableByLabel, text } from '@/testing/render';

import {
  CompanionSetupScreen,
  SLOW_AFTER_MS,
} from '../components/CompanionSetupScreen';
import { InactiveBusinessScreen } from '../components/InactiveBusinessScreen';

jest.mock('@/features/brand/ClovieAnimated', () => ({
  ClovieAnimated: () => null,
}));
const mockSignOut = jest.fn();
jest.mock('@/features/auth/useSignOut', () => ({
  useSignOut: () => mockSignOut,
}));
const mockRefetch = jest.fn();
jest.mock('@/features/companion/hooks', () => ({
  useCompanionSetup: () => ({ refetch: mockRefetch, isFetching: false }),
}));

describe('CompanionSetupScreen', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('says Clovie is being set up, with a speaker button and no controls at first', () => {
    const tree = mount(<CompanionSetupScreen />);
    const out = text(tree);
    expect(out).toContain('Clovie is being set up');
    expect(out).toContain('This takes a few seconds.');
    expect(() => pressableByLabel(tree, 'Try again')).toThrow();
    expect(pressableByLabel(tree, 'Read aloud')).toBeDefined();
  });

  it('admits when it is slow and offers a retry', () => {
    const tree = mount(<CompanionSetupScreen />);
    act(() => {
      jest.advanceTimersByTime(SLOW_AFTER_MS + 10);
    });
    expect(text(tree)).toContain('Taking longer than usual');
    act(() => pressableByLabel(tree, 'Try again').props.onPress());
    expect(mockRefetch).toHaveBeenCalled();
  });
});

describe('InactiveBusinessScreen', () => {
  it('tells staff to ask the owner, and lets them sign out', () => {
    const tree = mount(<InactiveBusinessScreen />);
    const out = text(tree);
    expect(out).toContain("Your business isn't active yet");
    expect(out).toContain('Ask the owner to choose a plan.');
    expect(out).not.toMatch(/\bfree\b/i);
    act(() => pressableByLabel(tree, 'Sign out').props.onPress());
    expect(mockSignOut).toHaveBeenCalled();
  });
});
