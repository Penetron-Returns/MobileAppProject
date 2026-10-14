import * as React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';

interface AuthButtonProps {
  label: string;
  onPress: () => void;
  /** `primary` is the tactile tint button; the others are raised. */
  tone?: 'primary' | 'neutral' | 'tint';
  icon?: React.ReactNode;
  /** Shows a spinner in place of the icon and blocks presses. */
  isBusy?: boolean;
  isDisabled?: boolean;
}

/** The 56pt pill buttons of the sign-in board (depth `primary` / `button`). */
export function AuthButton({
  label,
  onPress,
  tone = 'neutral',
  icon,
  isBusy,
  isDisabled,
}: AuthButtonProps) {
  const depth = useDepth();
  const isPrimary = tone === 'primary';
  const textColor = isPrimary
    ? '#FFFFFF'
    : tone === 'tint'
      ? depth.colors.tint
      : depth.colors.label;
  const isInert = Boolean(isBusy || isDisabled);

  return (
    <Pressable
      onPress={onPress}
      disabled={isInert}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isInert, busy: Boolean(isBusy) }}
    >
      {({ pressed }) => (
        <View
          style={[
            isPrimary ? depth.primary : depth.button,
            pressed && (isPrimary ? depth.primaryPressed : depth.buttonPressed),
            { borderRadius: 28, opacity: isDisabled && !isBusy ? 0.5 : 1 },
          ]}
          className="h-14 flex-row items-center justify-center gap-2"
        >
          {isBusy ? <ActivityIndicator color={textColor} /> : (icon ?? null)}
          <Text
            style={{ color: textColor }}
            className="text-title font-semibold"
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
