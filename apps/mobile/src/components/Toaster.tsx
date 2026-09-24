import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { dismiss, useToasts, type ToastItem } from '@/lib/toast';
import { cn } from '@/lib/utils';

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info };

function ToastCard({ item }: { item: ToastItem }) {
  const { t } = useTranslation();
  return (
    <Animated.View entering={FadeInUp} exiting={FadeOutUp}>
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        className={cn(
          'bg-card border-border flex-row items-start gap-3 rounded-xl border p-3.5 shadow-lg shadow-black/10',
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
              {t('errors.requestId', { id: item.requestId })}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => dismiss(item.id)}
          accessibilityRole="button"
          accessibilityLabel={t('common.dismiss')}
          hitSlop={12}
        >
          <Icon as={X} size={16} className="text-muted-foreground" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

export function Toaster() {
  const toasts = useToasts();
  const insets = useSafeAreaInsets();
  if (!toasts.length) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ top: insets.top + 8 }}
      className="absolute left-0 right-0 z-50 items-center px-4"
    >
      <View pointerEvents="box-none" className="w-full max-w-md gap-2">
        {toasts.map((item) => (
          <ToastCard key={item.id} item={item} />
        ))}
      </View>
    </View>
  );
}
