import * as React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { Text } from '../primitives/Text';

/** The pinned primary action under a settings form (thumb reach, per SOFT.md). */
export function SaveFooter({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="w-full max-w-2xl self-center px-5 pt-3"
      style={{ paddingBottom: insets.bottom + 12 }}
    >
      <Button
        onPress={onPress}
        disabled={disabled}
        accessibilityLabel={label}
        className="h-12"
      >
        <Text>{label}</Text>
      </Button>
    </View>
  );
}
