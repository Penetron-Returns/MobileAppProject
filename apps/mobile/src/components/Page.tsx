import { ChevronLeft } from 'lucide-react-native';
import * as React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ground } from '@/components/Ground';
import { goBack } from '@/components/StackHeader';
import {
  INBOX_DOME_CLEARANCE,
  tabBarClearance,
} from '@/components/tab-bar/layout';
import { Text } from '@/components/ui/text';
import { useAppColorScheme } from '@/hooks/useAppColorScheme';
import { useDepth } from '@/hooks/useDepth';

interface PageProps {
  /** Large title under the (optional) back pill. */
  title: string;
  /** Small line above the title (e.g. a date). */
  caption?: string | null;
  /** Shows the back pill with this label (pushed screens). */
  backLabel?: string;
  /** Where back goes when there is no history (deep link, web refresh). */
  backFallback?: string;
  /** Top-level tab screen: leaves room for the floating bar (and the Inbox dome). */
  isTab?: boolean;
  /** Control at the right of the title row (e.g. a button). */
  titleRight?: React.ReactNode;
  onRefresh?: () => void | Promise<unknown>;
  /** Pinned under the scroll area (composer, primary action). */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The shared shell of the depth-styled screens: ground gradient, safe areas,
 * a back pill on pushed screens, the 34pt large title and pull to refresh.
 */
export function Page({
  title,
  caption,
  backLabel,
  backFallback,
  isTab,
  titleRight,
  onRefresh,
  footer,
  children,
}: PageProps) {
  const insets = useSafeAreaInsets();
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

  const bottom = isTab
    ? tabBarClearance(insets.bottom) + INBOX_DOME_CLEARANCE
    : insets.bottom + 32;

  return (
    <Ground className="flex-1">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingTop: insets.top + 8,
            paddingBottom: footer ? 16 : bottom,
          }}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void handleRefresh()}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            ) : undefined
          }
        >
          <View className="w-full max-w-2xl self-center">
            {backLabel ? (
              <BackPill label={backLabel} fallback={backFallback} />
            ) : null}
            <View className="flex-row items-end justify-between pl-5 pr-4 pt-1">
              <View className="min-w-0 flex-1">
                {caption ? (
                  <Text className="text-subtitle font-semibold text-muted-foreground">
                    {caption}
                  </Text>
                ) : null}
                <Text
                  role="heading"
                  aria-level="1"
                  className="text-large-title font-bold"
                >
                  {title}
                </Text>
              </View>
              {titleRight}
            </View>
            {children}
          </View>
        </ScrollView>
        {footer}
      </KeyboardAvoidingView>
    </Ground>
  );
}

function BackPill({ label, fallback }: { label: string; fallback?: string }) {
  const depth = useDepth();
  return (
    <Pressable
      onPress={() => goBack(fallback)}
      accessibilityRole="button"
      accessibilityLabel={label}
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
          <ChevronLeft size={22} strokeWidth={2.4} color={depth.colors.tint} />
          <Text style={{ color: depth.colors.tint }} className="text-title">
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
