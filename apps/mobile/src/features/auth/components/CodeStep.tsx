import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput, View } from 'react-native';

import { Surface } from '@/components/Surface';
import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';
import { useNow } from '@/hooks/useNow';

import { AuthButton } from './AuthButton';
import { AuthError } from './AuthError';
import { StepFrame } from './StepFrame';
import type { AuthErrorKey } from '../errors';
import {
  codeCells,
  isCodeComplete,
  resendSecondsLeft,
  sanitizeCode,
} from '../logic';

interface CodeStepProps {
  email: string;
  isBusy: boolean;
  errorKey: AuthErrorKey | null;
  resendAt: number | null;
  didResend: boolean;
  onVerify: (code: string) => void;
  onResend: () => void;
  onChangeEmail: () => void;
  onEdit: () => void;
}

/** Six inset cells over one hidden input, so paste and autofill just work. */
export function CodeStep({
  email,
  isBusy,
  errorKey,
  resendAt,
  didResend,
  onVerify,
  onResend,
  onChangeEmail,
  onEdit,
}: CodeStepProps) {
  const { t } = useTranslation();
  const depth = useDepth();
  const inputRef = React.useRef<TextInput>(null);
  const [code, setCode] = React.useState('');
  const now = useNow(1000).getTime();
  const secondsLeft = resendSecondsLeft(resendAt, now);

  const handleChange = (raw: string) => {
    const next = sanitizeCode(raw);
    setCode(next);
    if (errorKey) onEdit();
    if (isCodeComplete(next)) onVerify(next);
  };

  const cells = codeCells(code);
  const active = Math.min(code.length, cells.length - 1);

  return (
    <StepFrame
      title={t('auth.code.title')}
      subtitle={t('auth.code.subtitle', { email })}
      onBack={onChangeEmail}
    >
      <Pressable
        onPress={() => inputRef.current?.focus()}
        accessible={false}
        className="relative"
      >
        <View className="flex-row justify-between gap-2">
          {cells.map((digit, i) => (
            <Surface
              key={i}
              variant="inset"
              radius={14}
              className="h-14 flex-1 items-center justify-center"
              style={
                i === active && !isBusy
                  ? { borderWidth: 1.5, borderColor: depth.colors.tint }
                  : undefined
              }
            >
              <Text className="text-section font-semibold">{digit}</Text>
            </Surface>
          ))}
        </View>
        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={handleChange}
          editable={!isBusy}
          autoFocus
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={12}
          accessibilityLabel={t('auth.code.label')}
          caretHidden
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.02,
            color: 'transparent',
          }}
        />
      </Pressable>
      <AuthError errorKey={errorKey} />
      {didResend && !errorKey ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: depth.colors.green }}
          className="text-center text-subtitle"
        >
          {t('auth.code.resent')}
        </Text>
      ) : null}
      <AuthButton
        label={isBusy ? t('auth.code.verifying') : t('auth.code.verify')}
        tone="primary"
        onPress={() => onVerify(code)}
        isBusy={isBusy}
        isDisabled={!isCodeComplete(code)}
      />
      <View className="items-center gap-1">
        <Pressable
          onPress={onResend}
          disabled={isBusy || secondsLeft > 0}
          accessibilityRole="button"
          accessibilityLabel={t('auth.code.resend')}
          accessibilityState={{ disabled: isBusy || secondsLeft > 0 }}
          className="min-h-11 justify-center px-3"
        >
          <Text
            style={{
              color:
                secondsLeft > 0 ? depth.colors.secondary : depth.colors.tint,
            }}
            className="text-title"
          >
            {secondsLeft > 0
              ? t('auth.code.resendIn', { seconds: secondsLeft })
              : t('auth.code.resend')}
          </Text>
        </Pressable>
        <Pressable
          onPress={onChangeEmail}
          accessibilityRole="button"
          accessibilityLabel={t('auth.code.notYou')}
          className="min-h-11 justify-center px-3"
        >
          <Text
            style={{ color: depth.colors.secondary }}
            className="text-subtitle"
          >
            {t('auth.code.notYou')}
          </Text>
        </Pressable>
      </View>
    </StepFrame>
  );
}
