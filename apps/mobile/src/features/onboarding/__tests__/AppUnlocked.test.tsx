import * as React from 'react';

import { act, mount, pressableByLabel, text } from '@/testing/render';

import { AppUnlockedScreen } from '../components/AppUnlockedScreen';
import { isUnlockTransition, useUnlockMoment } from '../unlockMoment';

jest.mock('@clerk/expo', () => ({ useAuth: () => ({ isSignedIn: true }) }));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('@/features/auth/useSignOut', () => ({
  useSignOut: () => jest.fn(),
}));
jest.mock('@/lib/speech', () => ({
  speak: jest.fn(),
  stopSpeaking: jest.fn(),
}));

describe('AppUnlockedScreen', () => {
  it('says the app is ready for the business and continues on Meet Clovie', () => {
    const onContinue = jest.fn();
    const tree = mount(
      <AppUnlockedScreen
        businessName="Thandi's Hair Studio"
        onContinue={onContinue}
      />,
    );
    expect(text(tree)).toContain("You're all set.");
    expect(text(tree)).toContain("Clovie is ready for Thandi's Hair Studio.");
    act(() => pressableByLabel(tree, 'Meet Clovie').props.onPress());
    expect(onContinue).toHaveBeenCalled();
  });
});

describe('isUnlockTransition', () => {
  it.each([
    ['choose-plan', 'companion-setup', true],
    ['choose-plan', 'tabs', true],
    ['choose-plan', 'onboarding', false],
    ['splash', 'tabs', false],
    ['companion-setup', 'tabs', false],
  ] as const)('%s -> %s is %s', (from, to, expected) => {
    expect(isUnlockTransition(from, to)).toBe(expected);
  });
});

describe('useUnlockMoment', () => {
  type Kind = Parameters<typeof useUnlockMoment>[0];
  function setup(initial: Kind) {
    const ref: { current: ReturnType<typeof useUnlockMoment> | null } = {
      current: null,
    };
    let setKind!: (k: Kind) => void;
    function Probe() {
      const [kind, set] = React.useState<Kind>(initial);
      setKind = set;
      ref.current = useUnlockMoment(kind);
      return null;
    }
    mount(<Probe />);
    return {
      ref: ref as { current: ReturnType<typeof useUnlockMoment> },
      set: (kind: Kind) => act(() => setKind(kind)),
    };
  }

  it('shows once when the plan screen gives way to the app, then stays dismissed', () => {
    const { ref, set } = setup('choose-plan');
    expect(ref.current.isShown).toBe(false);
    set('companion-setup');
    expect(ref.current.isShown).toBe(true);
    act(() => ref.current.dismiss());
    expect(ref.current.isShown).toBe(false);
    set('tabs');
    expect(ref.current.isShown).toBe(false);
  });

  it('does not show for an owner who already had a plan', () => {
    const { ref, set } = setup('splash');
    set('tabs');
    expect(ref.current.isShown).toBe(false);
  });
});
