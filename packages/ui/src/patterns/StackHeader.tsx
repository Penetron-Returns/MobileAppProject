import { ArrowLeft, X } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '../components/IconButton';
import { cn } from '../lib/cn';
import { Text } from '../primitives/Text';
import { goBack } from './navigation';
import { useDsText } from '../lib/strings';

export interface StackHeaderProps {
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

/** Back arrow + title bar used by the classic (non-large-title) pushed screens. */
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
  const t = useDsText();
  return (
    <View
      style={{ paddingTop: insets.top }}
      className="border-border bg-background border-b"
    >
      <View className="h-14 w-full max-w-2xl flex-row items-center self-center px-2">
        <View className="w-12 items-start">
          {hideBack ? null : (
            <IconButton
              icon={close ? X : ArrowLeft}
              label={close ? t('common.close') : t('common.back')}
              onPress={onBack ?? (() => goBack(fallbackHref))}
              variant="plain"
            />
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
