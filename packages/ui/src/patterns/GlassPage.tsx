import * as React from 'react';
import {
  KeyboardAvoidingView,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KEYBOARD_AVOIDING_BEHAVIOR } from '../lib/keyboard';
import { Ground } from '../primitives/Ground';
import { Text } from '../primitives/Text';
import { useAppColorScheme } from '../theme/useAppColorScheme';
import { useDepth } from '../theme/useDepth';
import { BackPill } from './BackPill';

/** Height of the nav row (back pill and title) under the status bar. */
export const GLASS_NAV_HEIGHT = 44;
/** Clear space between the nav row and the first content (board: 118 - 106). */
const CONTENT_GAP = 12;

export interface GlassPageProps {
  /** Centred 17pt title in the nav row (no large title on these screens). */
  title: string;
  backLabel: string;
  /** Where back goes when there is no history. */
  backFallback?: string;
  /** Overrides back (a detail view returning to its list). */
  onBack?: () => void;
  onRefresh?: () => void | Promise<unknown>;
  /** Pinned under the scroll area (a save button). */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The shell of the settings sub-screens (Team, Hours, Services): the ground
 * gradient, content scrolling under a fade, a frosted back pill at the left
 * and the title centred in the 44pt nav row.
 */
export function GlassPage({
  title,
  backLabel,
  backFallback,
  onBack,
  onRefresh,
  footer,
  children,
}: GlassPageProps) {
  const insets = useSafeAreaInsets();
  const depth = useDepth();
  const { colors } = useAppColorScheme();
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = React.useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const navBottom = insets.top + GLASS_NAV_HEIGHT;
  return (
    <Ground className="flex-1">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={KEYBOARD_AVOIDING_BEHAVIOR}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingTop: navBottom + CONTENT_GAP,
            paddingBottom: footer ? 16 : insets.bottom + 48,
          }}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void handleRefresh()}
                progressViewOffset={navBottom}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            ) : undefined
          }
        >
          <View className="w-full max-w-2xl self-center">{children}</View>
        </ScrollView>
        {footer}
      </KeyboardAvoidingView>

      <View
        pointerEvents="none"
        style={[
          depth.navFade,
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: navBottom,
          },
        ]}
      />
      <View style={{ position: 'absolute', top: insets.top, left: 12 }}>
        <BackPill
          variant="glass"
          label={backLabel}
          fallback={backFallback}
          onPress={onBack}
        />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: insets.top,
          left: 124,
          right: 124,
          height: GLASS_NAV_HEIGHT,
        }}
        className="items-center justify-center"
      >
        <Text
          role="heading"
          aria-level="1"
          numberOfLines={1}
          className="max-w-full text-title font-semibold"
        >
          {title}
        </Text>
      </View>
    </Ground>
  );
}
