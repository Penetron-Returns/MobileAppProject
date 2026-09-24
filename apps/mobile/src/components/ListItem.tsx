import { ChevronRight } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface ListItemProps {
  title: string;
  subtitle?: string;
  /** Rendered on the left (avatar, icon box, status dot…). */
  leading?: React.ReactNode;
  /** Rendered on the right, before the chevron (badge, amount, switch…). */
  trailing?: React.ReactNode;
  /** Shows a chevron and makes the row pressable. */
  onPress?: () => void;
  disabled?: boolean;
  className?: string;
}

/** A single row in a list: leading content, title/subtitle, trailing content. */
export function ListItem({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  disabled,
  className,
}: ListItemProps) {
  const content = (
    <View
      className={cn(
        'bg-card border-border flex-row items-center gap-3 rounded-xl border p-4',
        disabled && 'opacity-50',
        className,
      )}
    >
      {leading}
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={1} className="text-sm font-semibold">
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} className="text-muted-foreground text-xs">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {onPress ? (
        <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
      ) : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className="active:opacity-70"
    >
      {content}
    </Pressable>
  );
}
