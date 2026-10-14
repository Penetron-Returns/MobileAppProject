import * as React from 'react';

import { useAuthFlow } from '../useAuthFlow';
import { AuthBackdrop } from './AuthBackdrop';
import { CodeStep } from './CodeStep';
import { IdentifierStep } from './IdentifierStep';
import { WelcomeStep } from './WelcomeStep';

/**
 * Signed-out entry: welcome, email or mobile number, code. Our own UI on Clerk's headless
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
          onEmail={flow.goToIdentifier}
        />
      ) : null}
      {flow.step === 'identifier' ? (
        <IdentifierStep
          initialValue={flow.identifier}
          isBusy={flow.isBusy}
          errorKey={flow.errorKey}
          onSubmit={(value) => void flow.submitIdentifier(value)}
          onBack={flow.goToWelcome}
          onEdit={flow.clearError}
        />
      ) : null}
      {flow.step === 'code' ? (
        <CodeStep
          identifier={flow.identifier}
          strategy={flow.strategy}
          isBusy={flow.isBusy}
          errorKey={flow.errorKey}
          resendAt={flow.resendAt}
          didResend={flow.didResend}
          onVerify={(code) => void flow.verifyCode(code)}
          onResend={() => void flow.resendCode()}
          onChangeIdentifier={flow.changeIdentifier}
          onEdit={flow.clearError}
        />
      ) : null}
    </AuthBackdrop>
  );
}
