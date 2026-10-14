import { ChevronLeft } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';

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
  const { t } = useTranslation();
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
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={6}
          className="ml-3 min-h-11 justify-center self-start"
        >
          {({ pressed }) => (
            <View
              style={[
                depth.knob,
                pressed && depth.buttonPressed,
                { borderRadius: 20 },
              ]}
              className="h-10 flex-row items-center gap-0.5 pl-2 pr-4"
            >
              <ChevronLeft
                size={22}
                strokeWidth={2.4}
                color={depth.colors.tint}
              />
              <Text style={{ color: depth.colors.tint }} className="text-title">
                {t('common.back')}
              </Text>
            </View>
          )}
        </Pressable>
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
