import { useSignIn, useSignUp, useSSO } from '@clerk/expo';
import { router } from 'expo-router';
import * as React from 'react';

import {
  authErrorKey,
  isAlreadySignedIn,
  isUnknownIdentifier,
  type AuthErrorKey,
} from './errors';
import { isValidEmail, normalizeEmail, RESEND_COOLDOWN_SECONDS } from './logic';

export type AuthStep = 'welcome' | 'email' | 'code';
type Mode = 'signIn' | 'signUp';

export interface AuthFlow {
  step: AuthStep;
  email: string;
  errorKey: AuthErrorKey | null;
  /** True while any Clerk request is in flight. */
  isBusy: boolean;
  /** Epoch ms when "resend" unlocks, or null before a code was sent. */
  resendAt: number | null;
  /** Set briefly after a successful resend. */
  didResend: boolean;
  goToEmail: () => void;
  goToWelcome: () => void;
  submitEmail: (email: string) => Promise<void>;
  verifyCode: (code: string) => Promise<void>;
  resendCode: () => Promise<void>;
  changeEmail: () => void;
  continueWithGoogle: () => Promise<void>;
  clearError: () => void;
}

const goHome = () => router.replace('/');

/**
 * The email-code sign-in / sign-up flow on Clerk's headless hooks. One screen
 * covers both: we try to sign in, and when Clerk says the email has no
 * account we start a sign-up with the same email. Clerk issues and checks the
 * codes, rate-limits and bot-checks; we only drive the steps and show copy.
 */
export function useAuthFlow(): AuthFlow {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { startSSOFlow } = useSSO();

  const [step, setStep] = React.useState<AuthStep>('welcome');
  const [email, setEmail] = React.useState('');
  const [mode, setMode] = React.useState<Mode>('signIn');
  const [errorKey, setErrorKey] = React.useState<AuthErrorKey | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);
  const [resendAt, setResendAt] = React.useState<number | null>(null);
  const [didResend, setDidResend] = React.useState(false);

  /** Runs one Clerk step: busy flag, error mapping, "already signed in" shortcut. */
  const run = React.useCallback(async (action: () => Promise<boolean>) => {
    setIsBusy(true);
    setErrorKey(null);
    try {
      await action();
    } catch (e) {
      setErrorKey(authErrorKey(e));
    } finally {
      setIsBusy(false);
    }
  }, []);

  /** Returns true when the result was an error that has been handled. */
  const failed = React.useCallback((error: unknown) => {
    if (!error) return false;
    if (isAlreadySignedIn(error)) {
      goHome();
      return true;
    }
    setErrorKey(authErrorKey(error));
    return true;
  }, []);

  const armResend = React.useCallback(() => {
    setResendAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
  }, []);

  const submitEmail = React.useCallback(
    async (raw: string) => {
      const address = normalizeEmail(raw);
      if (!isValidEmail(address)) {
        setErrorKey('emailInvalid');
        return;
      }
      await run(async () => {
        const first = await signIn.emailCode.sendCode({
          emailAddress: address,
        });
        if (!first.error) {
          setEmail(address);
          setMode('signIn');
          armResend();
          setStep('code');
          return true;
        }
        if (!isUnknownIdentifier(first.error)) return failed(first.error);

        const created = await signUp.create({ emailAddress: address });
        if (failed(created.error)) return false;
        const sent = await signUp.verifications.sendEmailCode();
        if (failed(sent.error)) return false;
        setEmail(address);
        setMode('signUp');
        armResend();
        setStep('code');
        return true;
      });
    },
    [signIn, signUp, run, failed, armResend],
  );

  const verifyCode = React.useCallback(
    async (code: string) => {
      await run(async () => {
        if (mode === 'signIn') {
          const { error } = await signIn.emailCode.verifyCode({ code });
          if (failed(error)) return false;
          if (signIn.status !== 'complete') {
            setErrorKey('secondFactorUnsupported');
            return false;
          }
          const done = await signIn.finalize({ navigate: goHome });
          return !failed(done.error);
        }
        const { error } = await signUp.verifications.verifyEmailCode({ code });
        if (failed(error)) return false;
        if (signUp.status !== 'complete') {
          setErrorKey('signUpIncomplete');
          return false;
        }
        const done = await signUp.finalize({ navigate: goHome });
        return !failed(done.error);
      });
    },
    [mode, signIn, signUp, run, failed],
  );

  const resendCode = React.useCallback(async () => {
    setDidResend(false);
    await run(async () => {
      const { error } =
        mode === 'signIn'
          ? await signIn.emailCode.sendCode()
          : await signUp.verifications.sendEmailCode();
      if (failed(error)) return false;
      armResend();
      setDidResend(true);
      return true;
    });
  }, [mode, signIn, signUp, run, failed, armResend]);

  const changeEmail = React.useCallback(() => {
    void signIn.reset();
    void signUp.reset();
    setErrorKey(null);
    setDidResend(false);
    setResendAt(null);
    setStep('email');
  }, [signIn, signUp]);

  const continueWithGoogle = React.useCallback(async () => {
    await run(async () => {
      const result = await startSSOFlow({ strategy: 'oauth_google' });
      if (result.createdSessionId && result.setActive) {
        await result.setActive({
          session: result.createdSessionId,
          navigate: async () => {},
        });
        goHome();
        return true;
      }
      // Cancelled by the user: nothing to show. A sign-up that still needs
      // fields we do not collect cannot be finished here.
      if (result.signUp?.status === 'missing_requirements') {
        setErrorKey('signUpIncomplete');
      }
      return false;
    });
  }, [startSSOFlow, run]);

  return {
    step,
    email,
    errorKey,
    isBusy,
    resendAt,
    didResend,
    goToEmail: () => {
      setErrorKey(null);
      setStep('email');
    },
    goToWelcome: () => {
      setErrorKey(null);
      setStep('welcome');
    },
    submitEmail,
    verifyCode,
    resendCode,
    changeEmail,
    continueWithGoogle,
    clearError: () => setErrorKey(null),
  };
}
