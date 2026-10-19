import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

import { setAnalytics } from '@/features/analytics';
import { createFakeAnalytics } from '@/features/analytics/testing';

import { useAuthFlow, type AuthFlow } from '../useAuthFlow';

const mockSignIn = {
  status: 'needs_first_factor',
  emailCode: { sendCode: jest.fn(), verifyCode: jest.fn() },
  phoneCode: { sendCode: jest.fn(), verifyCode: jest.fn() },
  finalize: jest.fn(),
  reset: jest.fn(),
};
const mockSignUp = {
  status: 'missing_requirements',
  create: jest.fn(),
  verifications: {
    sendEmailCode: jest.fn(),
    verifyEmailCode: jest.fn(),
    sendPhoneCode: jest.fn(),
    verifyPhoneCode: jest.fn(),
  },
  finalize: jest.fn(),
  reset: jest.fn(),
};

jest.mock('@clerk/expo', () => ({
  useSignIn: () => ({ signIn: mockSignIn }),
  useSignUp: () => ({ signUp: mockSignUp }),
  useSSO: () => ({ startSSOFlow: jest.fn() }),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));

const apiError = (code: string) => ({ errors: [{ code, message: 'x' }] });

function mountFlow() {
  const ref: { current: AuthFlow | null } = { current: null };
  function Probe() {
    ref.current = useAuthFlow();
    return null;
  }
  act(() => {
    renderer.create(<Probe />);
  });
  return ref as { current: AuthFlow };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignIn.status = 'needs_first_factor';
  mockSignUp.status = 'missing_requirements';
  mockSignIn.emailCode.sendCode.mockResolvedValue({ error: null });
  mockSignIn.emailCode.verifyCode.mockResolvedValue({ error: null });
  mockSignIn.finalize.mockResolvedValue({ error: null });
  mockSignIn.phoneCode.sendCode.mockResolvedValue({ error: null });
  mockSignIn.phoneCode.verifyCode.mockResolvedValue({ error: null });
  mockSignUp.verifications.sendPhoneCode.mockResolvedValue({ error: null });
  mockSignUp.verifications.verifyPhoneCode.mockResolvedValue({ error: null });
  mockSignUp.create.mockResolvedValue({ error: null });
  mockSignUp.verifications.sendEmailCode.mockResolvedValue({ error: null });
  mockSignUp.verifications.verifyEmailCode.mockResolvedValue({ error: null });
  mockSignUp.finalize.mockResolvedValue({ error: null });
});

describe('useAuthFlow', () => {
  it('signs an existing account in with an emailed code', async () => {
    const flow = mountFlow();
    await act(async () => {
      await flow.current.submitIdentifier(' Colin@example.com ');
    });
    expect(mockSignIn.emailCode.sendCode).toHaveBeenCalledWith({
      emailAddress: 'colin@example.com',
    });
    expect(mockSignUp.create).not.toHaveBeenCalled();
    expect(flow.current.step).toBe('code');

    mockSignIn.status = 'complete';
    await act(async () => {
      await flow.current.verifyCode('123456');
    });
    expect(mockSignIn.emailCode.verifyCode).toHaveBeenCalledWith({
      code: '123456',
    });
    expect(mockSignIn.finalize).toHaveBeenCalled();
  });

  it('starts a sign-up when the email has no account', async () => {
    mockSignIn.emailCode.sendCode.mockResolvedValue({
      error: apiError('form_identifier_not_found'),
    });
    const flow = mountFlow();
    await act(async () => {
      await flow.current.submitIdentifier('new@example.com');
    });
    expect(mockSignUp.create).toHaveBeenCalledWith({
      emailAddress: 'new@example.com',
    });
    expect(mockSignUp.verifications.sendEmailCode).toHaveBeenCalled();
    expect(flow.current.step).toBe('code');

    mockSignUp.status = 'complete';
    await act(async () => {
      await flow.current.verifyCode('123456');
    });
    expect(mockSignUp.verifications.verifyEmailCode).toHaveBeenCalledWith({
      code: '123456',
    });
    expect(mockSignUp.finalize).toHaveBeenCalled();
  });

  it('rejects an invalid email without calling Clerk', async () => {
    const flow = mountFlow();
    await act(async () => {
      await flow.current.submitIdentifier('nope');
    });
    expect(flow.current.errorKey).toBe('emailInvalid');
    expect(mockSignIn.emailCode.sendCode).not.toHaveBeenCalled();
  });

  it('shows plain copy for a wrong code and stays on the code step', async () => {
    mockSignIn.emailCode.verifyCode.mockResolvedValue({
      error: apiError('form_code_incorrect'),
    });
    const flow = mountFlow();
    await act(async () => {
      await flow.current.submitIdentifier('colin@example.com');
    });
    await act(async () => {
      await flow.current.verifyCode('000000');
    });
    expect(flow.current.errorKey).toBe('codeIncorrect');
    expect(flow.current.step).toBe('code');
    expect(mockSignIn.finalize).not.toHaveBeenCalled();
  });

  it('reports an unfinished sign-up when Clerk still wants more fields', async () => {
    mockSignIn.emailCode.sendCode.mockResolvedValue({
      error: apiError('form_identifier_not_found'),
    });
    const flow = mountFlow();
    await act(async () => {
      await flow.current.submitIdentifier('new@example.com');
    });
    await act(async () => {
      await flow.current.verifyCode('123456');
    });
    expect(flow.current.errorKey).toBe('signUpIncomplete');
    expect(mockSignUp.finalize).not.toHaveBeenCalled();
  });

  it('maps a network failure to its own message', async () => {
    mockSignIn.emailCode.sendCode.mockRejectedValue(
      new TypeError('Network request failed'),
    );
    const flow = mountFlow();
    await act(async () => {
      await flow.current.submitIdentifier('colin@example.com');
    });
    expect(flow.current.errorKey).toBe('network');
    expect(flow.current.step).toBe('welcome');
  });

  it('signs in by SMS code when given a mobile number', async () => {
    const flow = mountFlow();
    await act(async () => {
      await flow.current.submitIdentifier('+27 82 555 0100');
    });
    expect(mockSignIn.phoneCode.sendCode).toHaveBeenCalledWith({
      phoneNumber: '+27825550100',
    });
    expect(mockSignIn.emailCode.sendCode).not.toHaveBeenCalled();
    expect(flow.current.strategy).toBe('phone_code');
    expect(flow.current.identifier).toBe('+27825550100');

    mockSignIn.status = 'complete';
    await act(async () => {
      await flow.current.verifyCode('123456');
    });
    expect(mockSignIn.phoneCode.verifyCode).toHaveBeenCalledWith({
      code: '123456',
    });
    expect(mockSignIn.emailCode.verifyCode).not.toHaveBeenCalled();
    expect(mockSignIn.finalize).toHaveBeenCalled();
  });

  it('starts a sign-up by SMS when the number has no account', async () => {
    mockSignIn.phoneCode.sendCode.mockResolvedValue({
      error: apiError('form_identifier_not_found'),
    });
    const flow = mountFlow();
    await act(async () => {
      await flow.current.submitIdentifier('+27825550100');
    });
    expect(mockSignUp.create).toHaveBeenCalledWith({
      phoneNumber: '+27825550100',
    });
    expect(mockSignUp.verifications.sendPhoneCode).toHaveBeenCalled();

    mockSignUp.status = 'complete';
    await act(async () => {
      await flow.current.verifyCode('123456');
    });
    expect(mockSignUp.verifications.verifyPhoneCode).toHaveBeenCalledWith({
      code: '123456',
    });
    expect(mockSignUp.finalize).toHaveBeenCalled();
  });

  it('resends the SMS code through the phone strategy', async () => {
    const flow = mountFlow();
    await act(async () => {
      await flow.current.submitIdentifier('+27825550100');
    });
    await act(async () => {
      await flow.current.resendCode();
    });
    expect(mockSignIn.phoneCode.sendCode).toHaveBeenCalledTimes(2);
    expect(mockSignIn.emailCode.sendCode).not.toHaveBeenCalled();
  });

  it('verifies a code once when verify is triggered twice before Clerk answers', async () => {
    const flow = mountFlow();
    await act(async () => {
      await flow.current.submitIdentifier('colin@example.com');
    });
    mockSignIn.status = 'complete';
    let release!: (v: { error: null }) => void;
    mockSignIn.emailCode.verifyCode.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    await act(async () => {
      const first = flow.current.verifyCode('123456');
      const second = flow.current.verifyCode('123456');
      release({ error: null });
      await Promise.all([first, second]);
    });
    expect(mockSignIn.emailCode.verifyCode).toHaveBeenCalledTimes(1);
    expect(mockSignIn.finalize).toHaveBeenCalledTimes(1);
  });
});

describe('useAuthFlow analytics', () => {
  afterEach(() => setAnalytics());

  it('reports sign-in started, code sent and completed, without the email', async () => {
    const fake = createFakeAnalytics();
    setAnalytics(fake);
    const flow = mountFlow();
    await act(async () => {
      await flow.current.submitIdentifier('colin@example.com');
    });
    mockSignIn.status = 'complete';
    await act(async () => {
      await flow.current.verifyCode('123456');
    });
    expect(fake.names()).toEqual([
      'signin_started',
      'signin_code_sent',
      'signin_completed',
    ]);
    expect(JSON.stringify(fake.events)).not.toContain('colin');
  });

  it('does not report completion when the code is wrong', async () => {
    const fake = createFakeAnalytics();
    setAnalytics(fake);
    mockSignIn.emailCode.verifyCode.mockResolvedValue({
      error: apiError('form_code_incorrect'),
    });
    const flow = mountFlow();
    await act(async () => {
      await flow.current.submitIdentifier('colin@example.com');
    });
    await act(async () => {
      await flow.current.verifyCode('000000');
    });
    expect(fake.names()).not.toContain('signin_completed');
  });
});
