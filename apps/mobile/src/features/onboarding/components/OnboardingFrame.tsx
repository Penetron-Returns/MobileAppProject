import {
  FlowFooter,
  FlowHeading,
  FlowTopBar,
  Ground,
  KEYBOARD_AVOIDING_BEHAVIOR,
} from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SpeakButton } from '@/components/SpeakButton';

import { STAGE_COUNT } from '../logic';

/**
 * The shared shell of every first-run screen: progress over four stages, one
 * short question with a speaker button that reads it aloud, the content, and
 * an optional pinned footer. `spoken` defaults to the title.
 */
export function OnboardingFrame({
  stage,
  title,
  spoken,
  showBack = false,
  onBack,
  footer,
  children,
}: {
  stage: 1 | 2 | 3 | 4;
  title: string;
  spoken?: string;
  showBack?: boolean;
  onBack?: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Ground className="flex-1">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={KEYBOARD_AVOIDING_BEHAVIOR}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{
            paddingTop: insets.top + 58,
            paddingBottom: footer ? 190 : 40,
          }}
        >
          <View className="w-full max-w-2xl self-center">
            <View className="flex-row items-start gap-3 px-5 pb-6 pt-2">
              <View className="min-w-0 flex-1">
                <FlowHeading title={title} />
              </View>
              <SpeakButton text={spoken ?? title} />
            </View>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <FlowTopBar
        value={stage}
        max={STAGE_COUNT}
        progressLabel={t('onboarding.progress')}
        showBack={showBack}
        onBack={onBack ?? (() => undefined)}
      />
      {footer ? <FlowFooter>{footer}</FlowFooter> : null}
    </Ground>
  );
}
