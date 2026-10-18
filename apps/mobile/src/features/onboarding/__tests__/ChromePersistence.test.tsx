import { act, flush, mount, pressableByLabel, text } from '@/testing/render';

import { OnboardingFlow } from '../components/OnboardingFlow';
import { initialDraft } from '../logic';

jest.mock('@/features/auth/useSignOut', () => ({
  useSignOut: () => jest.fn(),
}));
jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ isSignedIn: false }),
  useUser: () => ({ user: null }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useIsFocused: () => true,
}));
jest.mock('@/features/brand/ClovieAnimated', () => ({
  ClovieAnimated: () => null,
}));
jest.mock('@/features/brand/ClovieLoading', () => ({
  ClovieLoading: () => null,
}));
jest.mock('../hooks', () => ({
  useCompleteOnboarding: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('../storage', () => ({
  loadDraft: () => Promise.resolve(require('../logic').initialDraft()),
  saveDraft: jest.fn(),
  clearDraft: jest.fn(),
  saveBusinessType: () => Promise.resolve(),
}));

const mockMounts = jest.fn();
jest.mock('@/features/brand/ClovieWordmark', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    ClovieWordmark: () => {
      React.useEffect(() => {
        mockMounts();
      }, []);
      return <View testID="clovie-wordmark" />;
    },
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

describe('persistent onboarding chrome', () => {
  it('keeps the header mounted (never remounted) across step changes, forward and back', async () => {
    expect(initialDraft().typeId).toBeNull();
    const tree = mount(<OnboardingFlow isSignedIn={false} />);
    await flush();
    expect(text(tree)).toContain("Hi, I'm Clovie.");
    expect(mockMounts).toHaveBeenCalledTimes(1);

    act(() => pressableByLabel(tree, 'Start').props.onPress());
    expect(text(tree)).toContain('What kind of business?');
    expect(mockMounts).toHaveBeenCalledTimes(1);

    // Back appears with the type step, in the same header.
    act(() => pressableByLabel(tree, 'Back').props.onPress());
    expect(text(tree)).toContain("Hi, I'm Clovie.");
    expect(mockMounts).toHaveBeenCalledTimes(1);
  });

  it('has the progress dots on the type step, inside the one chrome', async () => {
    const tree = mount(<OnboardingFlow isSignedIn={false} />);
    await flush();
    act(() => pressableByLabel(tree, 'Start').props.onPress());
    expect(
      tree.root.findAllByProps({ testID: 'dot-active' }).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: 'onboarding-wordmark' }).length,
    ).toBeGreaterThan(0);
  });
});
