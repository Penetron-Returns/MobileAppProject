import { useSignIn, useSignUp, useSSO } from '@clerk/expo';
import { router } from 'expo-router';
import * as React from 'react';

import {
  authErrorKey,
  isAlreadySignedIn,
  isUnknownIdentifier,
  type AuthErrorKey,
} from './errors';
import {
  parseIdentifier,
  RESEND_COOLDOWN_SECONDS,
  type CodeStrategy,
} from './logic';

export type AuthStep = 'welcome' | 'identifier' | 'code';
type Mode = 'signIn' | 'signUp';

export interface AuthFlow {
  step: AuthStep;
  /** The email or E.164 phone number the code went to. */
  identifier: string;
  /** How the code was sent: by email or by SMS. */
  strategy: CodeStrategy;
  errorKey: AuthErrorKey | null;
  /** True while any Clerk request is in flight. */
  isBusy: boolean;
  /** Epoch ms when "resend" unlocks, or null before a code was sent. */
  resendAt: number | null;
  /** Set briefly after a successful resend. */
  didResend: boolean;
  goToIdentifier: () => void;
  goToWelcome: () => void;
  submitIdentifier: (raw: string) => Promise<void>;
  verifyCode: (code: string) => Promise<void>;
  resendCode: () => Promise<void>;
  changeIdentifier: () => void;
  continueWithGoogle: () => Promise<void>;
  clearError: () => void;
}

const goHome = () => router.replace('/');

/**
 * The one-time-code sign-in / sign-up flow on Clerk's headless hooks, by email
 * code or SMS code (`sms-otp`). One screen covers both: we try to sign in, and
 * when Clerk says the identifier has no account we start a sign-up with it. Clerk issues and checks the
 * codes, rate-limits and bot-checks; we only drive the steps and show copy.
 */
export function useAuthFlow(): AuthFlow {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { startSSOFlow } = useSSO();

  const [step, setStep] = React.useState<AuthStep>('welcome');
  const [identifier, setIdentifier] = React.useState('');
  const [strategy, setStrategy] = React.useState<CodeStrategy>('email_code');
  const [mode, setMode] = React.useState<Mode>('signIn');
  const [errorKey, setErrorKey] = React.useState<AuthErrorKey | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);
  const [resendAt, setResendAt] = React.useState<number | null>(null);
  const [didResend, setDidResend] = React.useState(false);
  // A ref, not state: two taps (or auto-submit plus a tap) land before a re-render.
  const inFlight = React.useRef(false);

  /** Runs one Clerk step: busy flag, error mapping, "already signed in" shortcut. */
  const run = React.useCallback(async (action: () => Promise<boolean>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsBusy(true);
    setErrorKey(null);
    try {
      await action();
    } catch (e) {
      setErrorKey(authErrorKey(e));
    } finally {
      inFlight.current = false;
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

  const submitIdentifier = React.useCallback(
    async (raw: string) => {
      const parsed = parseIdentifier(raw);
      if (!parsed) {
        setErrorKey('emailInvalid');
        return;
      }
      const isPhone = parsed.strategy === 'phone_code';
      await run(async () => {
        const first = isPhone
          ? await signIn.phoneCode.sendCode({ phoneNumber: parsed.value })
          : await signIn.emailCode.sendCode({ emailAddress: parsed.value });
        if (!first.error) {
          setIdentifier(parsed.value);
          setStrategy(parsed.strategy);
          setMode('signIn');
          armResend();
          setStep('code');
          return true;
        }
        if (!isUnknownIdentifier(first.error)) return failed(first.error);

        const created = await signUp.create(
          isPhone
            ? { phoneNumber: parsed.value }
            : { emailAddress: parsed.value },
        );
        if (failed(created.error)) return false;
        const sent = isPhone
          ? await signUp.verifications.sendPhoneCode()
          : await signUp.verifications.sendEmailCode();
        if (failed(sent.error)) return false;
        setIdentifier(parsed.value);
        setStrategy(parsed.strategy);
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
          const { error } =
            strategy === 'phone_code'
              ? await signIn.phoneCode.verifyCode({ code })
              : await signIn.emailCode.verifyCode({ code });
          if (failed(error)) return false;
          if (signIn.status !== 'complete') {
            setErrorKey('secondFactorUnsupported');
            return false;
          }
          const done = await signIn.finalize({ navigate: goHome });
          return !failed(done.error);
        }
        const { error } =
          strategy === 'phone_code'
            ? await signUp.verifications.verifyPhoneCode({ code })
            : await signUp.verifications.verifyEmailCode({ code });
        if (failed(error)) return false;
        if (signUp.status !== 'complete') {
          setErrorKey('signUpIncomplete');
          return false;
        }
        const done = await signUp.finalize({ navigate: goHome });
        return !failed(done.error);
      });
    },
    [mode, strategy, signIn, signUp, run, failed],
  );

  const resendCode = React.useCallback(async () => {
    setDidResend(false);
    await run(async () => {
      const isPhone = strategy === 'phone_code';
      const { error } =
        mode === 'signIn'
          ? await (isPhone
              ? signIn.phoneCode.sendCode()
              : signIn.emailCode.sendCode())
          : await (isPhone
              ? signUp.verifications.sendPhoneCode()
              : signUp.verifications.sendEmailCode());
      if (failed(error)) return false;
      armResend();
      setDidResend(true);
      return true;
    });
  }, [mode, strategy, signIn, signUp, run, failed, armResend]);

  const changeIdentifier = React.useCallback(() => {
    void signIn.reset();
    void signUp.reset();
    setErrorKey(null);
    setDidResend(false);
    setResendAt(null);
    setStep('identifier');
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
    identifier,
    strategy,
    errorKey,
    isBusy,
    resendAt,
    didResend,
    goToIdentifier: () => {
      setErrorKey(null);
      setStep('identifier');
    },
    goToWelcome: () => {
      setErrorKey(null);
      setStep('welcome');
    },
    submitIdentifier,
    verifyCode,
    resendCode,
    changeIdentifier,
    continueWithGoogle,
    clearError: () => setErrorKey(null),
  };
}
