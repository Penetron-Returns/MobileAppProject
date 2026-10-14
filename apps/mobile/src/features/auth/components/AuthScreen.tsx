import * as React from 'react';

import { useAuthFlow } from '../useAuthFlow';
import { AuthBackdrop } from './AuthBackdrop';
import { CodeStep } from './CodeStep';
import { EmailStep } from './EmailStep';
import { WelcomeStep } from './WelcomeStep';

/**
 * Signed-out entry: welcome, email, code. Our own UI on Clerk's headless
 * hooks (`useAuthFlow`); the prebuilt `AuthView` is no longer used.
 */
export function AuthScreen() {
  const flow = useAuthFlow();

  return (
    <AuthBackdrop>
      {flow.step === 'welcome' ? (
        <WelcomeStep
          isBusy={flow.isBusy}
          errorKey={flow.errorKey}
          onGoogle={() => void flow.continueWithGoogle()}
          onEmail={flow.goToEmail}
        />
      ) : null}
      {flow.step === 'email' ? (
        <EmailStep
          initialEmail={flow.email}
          isBusy={flow.isBusy}
          errorKey={flow.errorKey}
          onSubmit={(email) => void flow.submitEmail(email)}
          onBack={flow.goToWelcome}
          onEdit={flow.clearError}
        />
      ) : null}
      {flow.step === 'code' ? (
        <CodeStep
          email={flow.email}
          isBusy={flow.isBusy}
          errorKey={flow.errorKey}
          resendAt={flow.resendAt}
          didResend={flow.didResend}
          onVerify={(code) => void flow.verifyCode(code)}
          onResend={() => void flow.resendCode()}
          onChangeEmail={flow.changeEmail}
          onEdit={flow.clearError}
        />
      ) : null}
    </AuthBackdrop>
  );
}
