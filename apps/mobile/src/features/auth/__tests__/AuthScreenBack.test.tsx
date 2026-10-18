import * as React from 'react';
import { BackHandler } from 'react-native';

import { act, mount } from '@/testing/render';

import { AuthScreen } from '../components/AuthScreen';

const mockFlow = {
  step: 'code',
  identifier: 'a@b.co',
  strategy: 'email_code',
  errorKey: null,
  isBusy: false,
  resendAt: 0,
  didResend: false,
  goToIdentifier: jest.fn(),
  goToWelcome: jest.fn(),
  changeIdentifier: jest.fn(),
  submitIdentifier: jest.fn(),
  verifyCode: jest.fn(),
  resendCode: jest.fn(),
  continueWithGoogle: jest.fn(),
  clearError: jest.fn(),
};
jest.mock('../useAuthFlow', () => ({ useAuthFlow: () => mockFlow }));
jest.mock('expo-router', () => ({
  router: { canGoBack: () => false, back: jest.fn() },
}));
jest.mock('../components/AuthBackdrop', () => ({
  AuthBackdrop: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../components/CodeStep', () => ({ CodeStep: () => null }));
jest.mock('../components/IdentifierStep', () => ({
  IdentifierStep: () => null,
}));
jest.mock('../components/WelcomeStep', () => ({ WelcomeStep: () => null }));

let listener: (() => boolean) | null = null;
beforeEach(() => {
  jest.clearAllMocks();
  listener = null;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, l) => {
    listener = l as () => boolean;
    return { remove: jest.fn() };
  });
});
afterEach(() => jest.restoreAllMocks());

describe('AuthScreen hardware Back', () => {
  it('goes from the code step to the identifier step', () => {
    mockFlow.step = 'code';
    act(() => void mount(<AuthScreen />));
    expect(listener?.()).toBe(true);
    expect(mockFlow.changeIdentifier).toHaveBeenCalled();
  });

  it('goes from the identifier step to the welcome', () => {
    mockFlow.step = 'identifier';
    act(() => void mount(<AuthScreen />));
    expect(listener?.()).toBe(true);
    expect(mockFlow.goToWelcome).toHaveBeenCalled();
  });

  it('leaves the welcome to the default (exit) when there is nowhere to go', () => {
    mockFlow.step = 'welcome';
    act(() => void mount(<AuthScreen />));
    expect(listener).toBeNull();
  });
});
