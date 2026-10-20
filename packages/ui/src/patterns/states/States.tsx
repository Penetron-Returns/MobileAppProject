import type { LucideIcon } from 'lucide-react-native';
import { Inbox } from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { IconDome } from '../../components/IconDome';
import { cn } from '../../lib/cn';
import { Icon } from '../../primitives/Icon';
import { Skeleton } from '../../primitives/Skeleton';
import { Text } from '../../primitives/Text';
import { useAppColorScheme } from '../../theme/useAppColorScheme';

export interface EmptyStateProps {
  /** `inline` sits inside a screen section; `screen` fills the screen below the title. */
  variant?: 'inline' | 'screen';
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/** Nothing here yet: a glyph, what it means, and optionally the way to add the first one. */
export function EmptyState({
  variant = 'inline',
  icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  if (variant === 'screen') {
    return (
      <View className={cn('items-center px-10 pt-24', className)}>
        <IconDome icon={icon} size="lg" />
        <Text
          role="heading"
          aria-level="2"
          className="mt-4 text-center text-section font-bold"
        >
          {title}
        </Text>
        {description ? (
          <Text className="mt-1.5 text-center text-title text-muted-foreground">
            {description}
          </Text>
        ) : null}
        {action ? <View className="mt-6">{action}</View> : null}
      </View>
    );
  }
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

/** Placeholder card while a single record loads. */
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

/** Full-screen spinner while the app decides where to go (auth, organisation). */
export function CenteredSpinner() {
  const { colors } = useAppColorScheme();
  return (
    <View className="bg-background flex-1 items-center justify-center">
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
