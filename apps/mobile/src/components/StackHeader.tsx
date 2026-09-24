import { router } from 'expo-router';
import { ArrowLeft, X } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface StackHeaderProps {
  title: string;
  /** Left-aligned title next to the back arrow (Client Profile style). */
  align?: 'center' | 'left';
  /** Use an X (modal-style close) instead of the back arrow. */
  close?: boolean;
  onBack?: () => void;
  /** Where to go when there is no history (deep link / web refresh). */
  fallbackHref?: string;
  right?: React.ReactNode;
  hideBack?: boolean;
}

export function goBack(fallbackHref = '/dashboard') {
  if (router.canGoBack()) router.back();
  else router.replace(fallbackHref as never);
}

/** Back arrow + title header used by every pushed screen in the mockups. */
export function StackHeader({
  title,
  align = 'center',
  close,
  onBack,
  fallbackHref,
  right,
  hideBack,
}: StackHeaderProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <View
      style={{ paddingTop: insets.top }}
      className="border-border bg-background border-b"
    >
      <View className="h-14 w-full max-w-2xl flex-row items-center self-center px-2">
        <View className="w-12 items-start">
          {hideBack ? null : (
            <Pressable
              onPress={onBack ?? (() => goBack(fallbackHref))}
              accessibilityRole="button"
              accessibilityLabel={close ? t('common.close') : t('common.back')}
              hitSlop={8}
              className="h-11 w-11 items-center justify-center rounded-full active:bg-accent"
            >
              <Icon
                as={close ? X : ArrowLeft}
                size={22}
                className="text-foreground"
              />
            </Pressable>
          )}
        </View>
        <Text
          role="heading"
          numberOfLines={1}
          className={cn(
            'flex-1 text-lg font-bold',
            align === 'center' ? 'text-center' : 'text-left',
          )}
        >
          {title}
        </Text>
        <View className="min-w-12 items-end">{right}</View>
      </View>
    </View>
  );
}
