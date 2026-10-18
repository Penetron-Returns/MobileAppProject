import * as React from 'react';
import { Linking } from 'react-native';

import {
  act,
  flush,
  mount,
  pressableByLabel,
  pressableByText,
  text,
} from '@/testing/render';

import { ChoosePlanScreen } from '../components/ChoosePlanScreen';
import {
  CHECK_EVERY_MS,
  CompanionSetupScreen,
  SLOW_AFTER_MS,
} from '../components/CompanionSetupScreen';
import { OnboardingFlow } from '../components/OnboardingFlow';
import { initialDraft, type OnboardingDraft } from '../logic';

jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ isSignedIn: false, userId: null }),
  useUser: () => ({ user: { fullName: 'Zoe Dlamini', firstName: 'Zoe' } }),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a) },
  useIsFocused: () => true,
}));
jest.mock('@/features/brand/ClovieAnimated', () => ({
  ClovieAnimated: () => null,
}));
jest.mock('@/features/brand/ClovieLoading', () => ({
  ClovieLoading: () => null,
}));
jest.mock('@/features/auth/useSignOut', () => ({
  useSignOut: () => jest.fn(),
}));
const mockCreate = jest.fn();
jest.mock('../hooks', () => ({
  useCompleteOnboarding: () => ({
    mutateAsync: (...a: unknown[]) => mockCreate(...a),
  }),
}));
let mockStored: OnboardingDraft = initialDraft();
const mockClear = jest.fn();
jest.mock('../storage', () => ({
  loadDraft: () => Promise.resolve(mockStored),
  saveDraft: jest.fn(),
  clearDraft: () => mockClear(),
  // Never settles: the flow must not wait on it.
  saveBusinessType: () => new Promise(() => undefined),
}));
const mockRefetch = jest.fn();
jest.mock('@/features/companion/hooks', () => ({
  useCompanionSetup: () => ({ refetch: mockRefetch, isFetching: false }),
}));
let mockOnline = true;
jest.mock('@/lib/online', () => ({ useIsOnline: () => mockOnline }));
let mockPlans: Record<string, unknown> = {};
jest.mock('@/features/plans/hooks', () => ({ usePlans: () => mockPlans }));
jest.mock('@/features/plans/useCheckout', () => ({
  useCheckout: () => ({ phase: { kind: 'idle' }, start: jest.fn() }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockStored = initialDraft();
  mockOnline = true;
  mockCreate.mockResolvedValue({ business: { id: 'biz_1' } });
});
afterEach(() => jest.useRealTimers());

describe('OnboardingFlow', () => {
  it('opens sign-in once for a double tap', async () => {
    const tree = mount(<OnboardingFlow isSignedIn={false} />);
    await flush();
    const link = () => pressableByLabel(tree, 'I already have an account');
    act(() => link().props.onPress());
    act(() => link().props.onPress());
    expect(mockPush).toHaveBeenCalledTimes(1);
    act(() => void jest.advanceTimersByTime(1000));
    act(() => link().props.onPress());
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it('hands over to the plan without waiting for storage writes', async () => {
    mockStored = { step: 3, typeId: 'barber', businessName: 'Cuts' };
    const onDone = jest.fn();
    mount(<OnboardingFlow isSignedIn onDone={onDone} />);
    await flush();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('CompanionSetupScreen when slow', () => {
  it('offers Continue to Clovie and Contact support', () => {
    const onContinue = jest.fn();
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const tree = mount(<CompanionSetupScreen onContinue={onContinue} />);
    expect(() => pressableByLabel(tree, 'Continue to Clovie')).toThrow();
    act(() => void jest.advanceTimersByTime(SLOW_AFTER_MS + 10));
    act(() => pressableByLabel(tree, 'Continue to Clovie').props.onPress());
    expect(onContinue).toHaveBeenCalled();
    act(() => pressableByLabel(tree, 'Contact support').props.onPress());
    expect(open).toHaveBeenCalledWith('mailto:support@nerovasystems.com');
    open.mockRestore();
  });

  it('stops its 900ms clock once every check that can land has', () => {
    mount(<CompanionSetupScreen />);
    act(() => void jest.advanceTimersByTime(CHECK_EVERY_MS));
    const running = jest.getTimerCount();
    act(() => void jest.advanceTimersByTime(CHECK_EVERY_MS * 2));
    expect(jest.getTimerCount()).toBe(running - 1);
  });
});

describe('ChoosePlanScreen offline', () => {
  it('says so with a Retry instead of skeletons', () => {
    mockOnline = false;
    mockPlans = { data: undefined, isError: false, refetch: mockRefetch };
    const tree = mount(<ChoosePlanScreen />);
    expect(text(tree)).toContain("You're offline");
    act(() => pressableByText(tree, 'Try again').props.onPress());
    expect(mockRefetch).toHaveBeenCalled();
  });
});
