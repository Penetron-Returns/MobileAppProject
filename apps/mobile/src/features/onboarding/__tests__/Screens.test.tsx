import * as React from 'react';

import { setAnalytics } from '@/features/analytics';
import {
  createFakeAnalytics,
  type FakeAnalytics,
} from '@/features/analytics/testing';
import { mount, text } from '@/testing/render';

import { ProgressDots } from '../components/ProgressDots';
import { TypeScreen } from '../components/TypeScreen';

jest.mock('@clerk/expo', () => ({ useAuth: () => ({ isSignedIn: true }) }));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));
const mockSignOut = jest.fn();
jest.mock('@/features/auth/useSignOut', () => ({
  useSignOut: () => mockSignOut,
}));

let fake: FakeAnalytics;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  fake = createFakeAnalytics();
  setAnalytics(fake);
});
afterEach(() => {
  jest.useRealTimers();
  setAnalytics();
});

describe('ProgressDots', () => {
  it.each([
    [1, ['active', 'todo'], 'Step 1 of 2'],
    [2, ['done', 'active'], 'Step 2 of 2'],
  ] as const)('stage %s draws two dots', (stage, states, label) => {
    const tree = mount(<ProgressDots stage={stage} />);
    const dots = tree.root.findAll(
      (n) =>
        typeof n.type === 'string' &&
        typeof n.props.testID === 'string' &&
        n.props.testID.startsWith('dot-'),
    );
    expect(dots.map((d) => d.props.testID.replace('dot-', ''))).toEqual(states);
    const flat = (d: (typeof dots)[number]) =>
      Object.assign({}, ...[d.props.style].flat());
    expect(dots.map((d) => flat(d).width)).toEqual(
      states.map((s) => (s === 'active' ? 20 : 8)),
    );
    expect(flat(dots[0]).height).toBe(8);
    expect(
      tree.root.findAll((n) => n.props.accessibilityLabel === label).length,
    ).toBeGreaterThan(0);
  });
});

describe('TypeScreen', () => {
  it('renders every tile label in full, including "A mix"', () => {
    const tree = mount(<TypeScreen selected={null} onSelect={jest.fn()} />);
    for (const label of ['Barbershop', 'Salon', 'Beauty parlor', 'A mix']) {
      expect(text(tree)).toContain(label);
    }
  });
});
