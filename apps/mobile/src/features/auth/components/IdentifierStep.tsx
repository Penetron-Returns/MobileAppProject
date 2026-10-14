import { Button, InsetInput, Text } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AuthError } from './AuthError';
import { StepFrame } from './StepFrame';
import type { AuthErrorKey } from '../errors';
import { parseIdentifier } from '../logic';

interface IdentifierStepProps {
  initialValue: string;
  isBusy: boolean;
  errorKey: AuthErrorKey | null;
  onSubmit: (value: string) => void;
  onBack: () => void;
  onEdit: () => void;
}

/** Email or mobile number: one inset field and Continue (sign in or sign up, code by email or SMS). */
export function IdentifierStep({
  initialValue,
  isBusy,
  errorKey,
  onSubmit,
  onBack,
  onEdit,
}: IdentifierStepProps) {
  const { t } = useTranslation();
  const [value, setValue] = React.useState(initialValue);
  const canSubmit = parseIdentifier(value) !== null;

  return (
    <StepFrame
      title={t('auth.identifier.title')}
      subtitle={t('auth.identifier.subtitle')}
      onBack={onBack}
    >
      <InsetInput
        label={t('auth.identifier.label')}
        placeholder={t('auth.identifier.placeholder')}
        value={value}
        onChangeText={(v) => {
          setValue(v);
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
        onSubmitEditing={() => canSubmit && onSubmit(value)}
        radius={16}
        containerClassName="min-h-14"
      />
      <AuthError errorKey={errorKey} />
      <Button
        size="xl"
        onPress={() => onSubmit(value)}
        loading={isBusy}
        disabled={!canSubmit}
        accessibilityLabel={
          isBusy ? t('auth.identifier.sending') : t('auth.identifier.continue')
        }
      >
        <Text>
          {isBusy
            ? t('auth.identifier.sending')
            : t('auth.identifier.continue')}
        </Text>
      </Button>
      {/* Clerk mounts its bot-protection challenge here on sign-up. */}
      <View nativeID="clerk-captcha" />
    </StepFrame>
  );
}
