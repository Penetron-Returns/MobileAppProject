import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  FadeInUp,
  FadeOutUp,
  ReduceMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from '../lib/cn';
import { Icon } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';
import { DURATION, SPRING } from '../tokens/motion';
import { Z_INDEX } from '../tokens/zIndex';
import { dismissToast, useToasts, type ToastItem } from './toastStore';
import { useDsText } from '../lib/strings';

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info };

function ToastCard({ item }: { item: ToastItem }) {
  const t = useDsText();
  const depth = useDepth();
  return (
    <Animated.View
      entering={FadeInUp.springify()
        .duration(SPRING.smooth.duration)
        .dampingRatio(SPRING.smooth.dampingRatio)
        .reduceMotion(ReduceMotion.System)}
      exiting={FadeOutUp.duration(DURATION.quick).reduceMotion(
        ReduceMotion.System,
      )}
    >
      <View
        style={{ boxShadow: depth.floating.boxShadow }}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        className={cn(
          'bg-card border-border flex-row items-start gap-3 rounded-xl border p-3.5',
          item.kind === 'error' && 'border-destructive/40',
          item.kind === 'success' && 'border-success/40',
        )}
      >
        <Icon
          as={ICONS[item.kind]}
          size={20}
          className={cn(
            item.kind === 'error' && 'text-destructive',
            item.kind === 'success' && 'text-success',
            item.kind === 'info' && 'text-primary',
          )}
        />
        <View className="flex-1 gap-0.5">
          <Text className="text-sm font-semibold">{item.title}</Text>
          {item.description ? (
            <Text className="text-muted-foreground text-sm">
              {item.description}
            </Text>
          ) : null}
          {item.requestId ? (
            <Text selectable className="text-muted-foreground text-xs">
              {t('errors.requestId', {
                id: item.requestId,
              })}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => dismissToast(item.id)}
          accessibilityRole="button"
          accessibilityLabel={t('common.dismiss')}
          hitSlop={14}
        >
          <Icon as={X} size={16} className="text-muted-foreground" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

/** Renders the queued toasts below the status bar. Mount once, inside the root providers. */
export function Toaster() {
  const toasts = useToasts();
  const insets = useSafeAreaInsets();
  if (!toasts.length) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ top: insets.top + 8, zIndex: Z_INDEX.toast }}
      className="absolute left-0 right-0 items-center px-4"
    >
      <View pointerEvents="box-none" className="w-full max-w-md gap-2">
        {toasts.map((item) => (
          <ToastCard key={item.id} item={item} />
        ))}
      </View>
    </View>
  );
}
