import { Button, Text, useDepth } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useNow } from '@/hooks/useNow';

import { AuthError } from './AuthError';
import { CodeBoxes } from './CodeBoxes';
import { StepFrame } from './StepFrame';
import type { AuthErrorKey } from '../errors';
import {
  isCodeComplete,
  resendSecondsLeft,
  sanitizeCode,
  type CodeStrategy,
} from '../logic';

interface CodeStepProps {
  identifier: string;
  strategy: CodeStrategy;
  isBusy: boolean;
  errorKey: AuthErrorKey | null;
  resendAt: number | null;
  didResend: boolean;
  onVerify: (code: string) => void;
  onResend: () => void;
  onChangeIdentifier: () => void;
  onEdit: () => void;
}

/** Six inset cells over one hidden input, so paste and autofill just work. */
export function CodeStep({
  identifier,
  strategy,
  isBusy,
  errorKey,
  resendAt,
  didResend,
  onVerify,
  onResend,
  onChangeIdentifier,
  onEdit,
}: CodeStepProps) {
  const { t } = useTranslation();
  const depth = useDepth();
  const [code, setCode] = React.useState('');
  const now = useNow(1000).getTime();
  const secondsLeft = resendSecondsLeft(resendAt, now);

  // The code last sent for verification. Auto-submit on the sixth digit and a
  // tap on Verify must not both fire for the same code.
  const submitted = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!isBusy) submitted.current = null;
  }, [isBusy]);

  const verify = (value: string) => {
    if (isBusy || !isCodeComplete(value) || submitted.current === value) return;
    submitted.current = value;
    onVerify(value);
  };

  const handleChange = (raw: string) => {
    const next = sanitizeCode(raw);
    setCode(next);
    if (errorKey) onEdit();
    verify(next);
  };

  return (
    <StepFrame
      title={t(`auth.code.title.${strategy}`)}
      subtitle={t(`auth.code.subtitle.${strategy}`, { identifier })}
      onBack={onChangeIdentifier}
    >
      <CodeBoxes
        value={code}
        onChangeText={handleChange}
        editable={!isBusy}
        label={t('auth.code.label')}
      />
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
      <Button
        size="xl"
        onPress={() => verify(code)}
        loading={isBusy}
        disabled={!isCodeComplete(code)}
        accessibilityLabel={
          isBusy ? t('auth.code.verifying') : t('auth.code.verify')
        }
      >
        <Text>{isBusy ? t('auth.code.verifying') : t('auth.code.verify')}</Text>
      </Button>
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
          onPress={onChangeIdentifier}
          accessibilityRole="button"
          accessibilityLabel={t(`auth.code.notYou.${strategy}`)}
          className="min-h-11 justify-center px-3"
        >
          <Text
            style={{ color: depth.colors.secondary }}
            className="text-subtitle"
          >
            {t(`auth.code.notYou.${strategy}`)}
          </Text>
        </Pressable>
      </View>
    </StepFrame>
  );
}
