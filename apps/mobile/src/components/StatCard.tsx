import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  /** Small delta/trend line under the value, e.g. "+12% vs last month". */
  hint?: string;
  hintTone?: 'default' | 'positive' | 'negative';
  className?: string;
}

/** A single metric tile for the dashboard (revenue, bookings today, …). */
export function StatCard({
  label,
  value,
  icon,
  hint,
  hintTone = 'default',
  className,
}: StatCardProps) {
  return (
    <View
      className={cn(
        'bg-card border-border flex-1 gap-2 rounded-2xl border p-4',
        className,
      )}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          {label}
        </Text>
        {icon ? (
          <Icon as={icon} size={16} className="text-muted-foreground" />
        ) : null}
      </View>
      <Text className="text-2xl font-bold">{value}</Text>
      {hint ? (
        <Text
          className={cn(
            'text-xs font-medium',
            hintTone === 'positive' && 'text-success',
            hintTone === 'negative' && 'text-destructive',
            hintTone === 'default' && 'text-muted-foreground',
          )}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
