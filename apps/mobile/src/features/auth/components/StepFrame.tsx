import { BackPill, Text, useDepth } from '@booking/ui';
import * as React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface StepFrameProps {
  title: string;
  subtitle: string;
  onBack: () => void;
  children: React.ReactNode;
}

/** Back pill, 34pt title and subtitle above a step's fields (email, code). */
export function StepFrame({
  title,
  subtitle,
  onBack,
  children,
}: StepFrameProps) {
  const depth = useDepth();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <BackPill onPress={onBack} />
        <View className="px-6 pt-6">
          <Text
            role="heading"
            aria-level="1"
            className="text-large-title font-bold"
          >
            {title}
          </Text>
          <Text
            style={{ color: depth.colors.secondary }}
            className="mt-2.5 text-title"
          >
            {subtitle}
          </Text>
          <View className="mt-7 gap-4">{children}</View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
