import * as React from 'react';

import { act, flush, mount, pressableByLabel } from '@/testing/render';

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
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockStored = initialDraft();
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

  it('hands over to the app without waiting for storage writes', async () => {
    mockStored = { step: 3, typeId: 'barber', businessName: 'Cuts' };
    const onDone = jest.fn();
    mount(<OnboardingFlow isSignedIn onDone={onDone} />);
    await flush();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
