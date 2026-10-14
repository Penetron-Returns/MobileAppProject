import { Button, InsetInput, Text } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AuthError } from './AuthError';
import { StepFrame } from './StepFrame';
import type { AuthErrorKey } from '../errors';
import { isValidEmail } from '../logic';

interface EmailStepProps {
  initialEmail: string;
  isBusy: boolean;
  errorKey: AuthErrorKey | null;
  onSubmit: (email: string) => void;
  onBack: () => void;
  onEdit: () => void;
}

/** Email entry: one inset field and a Continue button (sign in or sign up). */
export function EmailStep({
  initialEmail,
  isBusy,
  errorKey,
  onSubmit,
  onBack,
  onEdit,
}: EmailStepProps) {
  const { t } = useTranslation();
  const [email, setEmail] = React.useState(initialEmail);
  const canSubmit = isValidEmail(email);

  return (
    <StepFrame
      title={t('auth.email.title')}
      subtitle={t('auth.email.subtitle')}
      onBack={onBack}
    >
      <InsetInput
        label={t('auth.email.label')}
        placeholder={t('auth.email.placeholder')}
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          if (errorKey) onEdit();
        }}
        editable={!isBusy}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="go"
        onSubmitEditing={() => canSubmit && onSubmit(email)}
        radius={16}
        containerClassName="min-h-14"
      />
      <AuthError errorKey={errorKey} />
      <Button
        size="xl"
        onPress={() => onSubmit(email)}
        loading={isBusy}
        disabled={!canSubmit}
        accessibilityLabel={
          isBusy ? t('auth.email.sending') : t('auth.email.continue')
        }
      >
        <Text>
          {isBusy ? t('auth.email.sending') : t('auth.email.continue')}
        </Text>
      </Button>
      {/* Clerk mounts its bot-protection challenge here on sign-up. */}
      <View nativeID="clerk-captcha" />
    </StepFrame>
  );
}
