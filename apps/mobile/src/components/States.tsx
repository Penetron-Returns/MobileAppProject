import type { LucideIcon } from 'lucide-react-native';
import { AlertTriangle, Inbox } from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useAppColorScheme } from '@/hooks/useAppColorScheme';
import { isApiError } from '@/lib/api';
import { errorMessage } from '@/lib/toast';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={cn('items-center gap-2 px-6 py-10', className)}>
      <View className="bg-accent mb-1 h-14 w-14 items-center justify-center rounded-full">
        <Icon as={icon} size={26} className="text-primary" />
      </View>
      <Text className="text-center text-base font-semibold">{title}</Text>
      {description ? (
        <Text className="text-muted-foreground text-center text-sm">
          {description}
        </Text>
      ) : null}
      {action ? <View className="mt-2">{action}</View> : null}
    </View>
  );
}

/** Inline error banner with the API request id and a retry button. */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const requestId = isApiError(error) ? error.requestId : null;
  return (
    <View
      accessibilityRole="alert"
      className={cn(
        'border-destructive/30 bg-destructive/5 flex-row items-start gap-3 rounded-xl border p-4',
        className,
      )}
    >
      <Icon as={AlertTriangle} size={20} className="text-destructive mt-0.5" />
      <View className="flex-1 gap-1">
        <Text className="font-semibold">{t('errors.loadFailed')}</Text>
        <Text className="text-muted-foreground text-sm">
          {errorMessage(error)}
        </Text>
        {requestId ? (
          <Text selectable className="text-muted-foreground text-xs">
            {t('errors.requestId', { id: requestId })}
          </Text>
        ) : null}
        {onRetry ? (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 self-start"
            onPress={onRetry}
          >
            <Text>{t('common.retry')}</Text>
          </Button>
        ) : null}
      </View>
    </View>
  );
}

export function LoadingRows({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <View
      className={cn('gap-3', className)}
      accessibilityLabel="Loading"
      accessibilityState={{ busy: true }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          className="bg-card border-border flex-row items-center gap-3 rounded-xl border p-4"
        >
          <Skeleton className="h-11 w-11 rounded-full" />
          <View className="flex-1 gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </View>
        </View>
      ))}
    </View>
  );
}

export function LoadingCard({ className }: { className?: string }) {
  return (
    <View
      className={cn(
        'bg-card border-border gap-3 rounded-2xl border p-5',
        className,
      )}
    >
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-16 w-full" />
    </View>
  );
}

export function CenteredSpinner() {
  const { colors } = useAppColorScheme();
  return (
    <View className="bg-background flex-1 items-center justify-center">
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
