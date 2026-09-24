import * as React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  View,
  type ScrollViewProps,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useAppColorScheme } from '@/hooks/useAppColorScheme';
import { cn } from '@/lib/utils';

interface ScreenProps {
  children: React.ReactNode;
  /** Wrap content in a ScrollView (default true). */
  scroll?: boolean;
  /** Pull-to-refresh handler. */
  onRefresh?: () => void | Promise<unknown>;
  /** Header rendered above the scroll area. */
  header?: React.ReactNode;
  /** Footer pinned to the bottom (e.g. a primary action). */
  footer?: React.ReactNode;
  edges?: Edge[];
  className?: string;
  contentClassName?: string;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  scrollRef?: React.Ref<ScrollView>;
}

/** Page shell: safe areas, background, keyboard avoidance, pull-to-refresh. */
export function Screen({
  children,
  scroll = true,
  onRefresh,
  header,
  footer,
  edges = ['bottom', 'left', 'right'],
  className,
  contentClassName,
  keyboardShouldPersistTaps = 'handled',
  scrollRef,
}: ScreenProps) {
  const [refreshing, setRefreshing] = React.useState(false);
  const { colors } = useAppColorScheme();

  const handleRefresh = React.useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  return (
    <SafeAreaView
      edges={edges}
      className={cn('flex-1 bg-background', className)}
    >
      {header}
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scroll ? (
          <ScrollView
            ref={scrollRef}
            className="flex-1"
            contentContainerClassName={cn('px-4 pb-8 pt-4', contentClassName)}
            keyboardShouldPersistTaps={keyboardShouldPersistTaps}
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={colors.primary}
                  colors={[colors.primary]}
                />
              ) : undefined
            }
          >
            <View className="w-full max-w-2xl self-center gap-4">
              {children}
            </View>
          </ScrollView>
        ) : (
          <View className={cn('flex-1', contentClassName)}>{children}</View>
        )}
        {footer ? (
          <View className="border-border bg-background border-t px-4 pb-3 pt-3">
            <View className="w-full max-w-2xl self-center">{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
