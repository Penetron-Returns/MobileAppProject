import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

import { useAuthFlow, type AuthFlow } from '../useAuthFlow';

const mockSignIn = {
  status: 'needs_first_factor',
  emailCode: { sendCode: jest.fn(), verifyCode: jest.fn() },
  finalize: jest.fn(),
  reset: jest.fn(),
};
const mockSignUp = {
  status: 'missing_requirements',
  create: jest.fn(),
  verifications: { sendEmailCode: jest.fn(), verifyEmailCode: jest.fn() },
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
  mockSignUp.create.mockResolvedValue({ error: null });
  mockSignUp.verifications.sendEmailCode.mockResolvedValue({ error: null });
  mockSignUp.verifications.verifyEmailCode.mockResolvedValue({ error: null });
  mockSignUp.finalize.mockResolvedValue({ error: null });
});

describe('useAuthFlow', () => {
  it('signs an existing account in with an emailed code', async () => {
    const flow = mountFlow();
    await act(async () => {
      await flow.current.submitEmail(' Colin@Nerova.com ');
    });
    expect(mockSignIn.emailCode.sendCode).toHaveBeenCalledWith({
      emailAddress: 'colin@nerova.com',
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
      await flow.current.submitEmail('new@nerova.com');
    });
    expect(mockSignUp.create).toHaveBeenCalledWith({
      emailAddress: 'new@nerova.com',
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
      await flow.current.submitEmail('nope');
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
      await flow.current.submitEmail('colin@nerova.com');
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
      await flow.current.submitEmail('new@nerova.com');
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
      await flow.current.submitEmail('colin@nerova.com');
    });
    expect(flow.current.errorKey).toBe('network');
    expect(flow.current.step).toBe('welcome');
  });
});
