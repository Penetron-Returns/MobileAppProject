import * as React from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { Surface } from '../primitives/Surface';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';

/** A pressed-in field with a small label above the text (design: Business name). */
export function LabeledInsetField({
  label,
  ...props
}: TextInputProps & { label: string }) {
  const depth = useDepth();
  return (
    <Surface variant="inset" radius={26} className="px-4 py-3">
      <Text style={{ color: depth.colors.secondary }} className="text-meta">
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={depth.colors.secondary}
        style={{
          color: depth.colors.label,
          height: 30,
          padding: 0,
          fontSize: 17,
        }}
        {...props}
      />
    </Surface>
  );
}

/** A compact 40pt inset amount field with a leading currency symbol. */
export function AmountInsetField({
  symbol,
  label,
  value,
  onChangeText,
  width = 52,
}: {
  symbol: string;
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  width?: number;
}) {
  const depth = useDepth();
  return (
    <Surface
      variant="inset"
      radius={12}
      className="h-10 flex-row items-center px-2.5"
    >
      <Text
        importantForAccessibility="no"
        style={{ color: depth.colors.secondary }}
        className="text-title"
      >
        {symbol}
      </Text>
      <View style={{ width }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          accessibilityLabel={label}
          keyboardType="number-pad"
          maxLength={6}
          style={{
            color: depth.colors.label,
            height: 40,
            paddingLeft: 3,
            paddingVertical: 0,
            fontSize: 17,
            fontVariant: ['tabular-nums'],
          }}
        />
      </View>
    </Surface>
  );
}
