import { View } from 'react-native';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Text } from '@/components/ui/text';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: { box: 'size-9', text: 'text-xs' },
  md: { box: 'size-11', text: 'text-sm' },
  lg: { box: 'size-14', text: 'text-lg' },
  xl: { box: 'size-24', text: 'text-3xl' },
} as const;

/** Photo when available, otherwise initials on a soft brand tint (mockup style). */
export function PersonAvatar({
  name,
  imageUrl,
  size = 'md',
  solid,
  online,
  className,
}: {
  name: string | null | undefined;
  imageUrl?: string | null;
  size?: keyof typeof SIZES;
  /** Filled primary circle (the highlighted "next" row in the dashboard). */
  solid?: boolean;
  /** Small green presence dot. */
  online?: boolean;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <View className={cn('relative', className)}>
      <Avatar alt={name ?? 'Client'} className={cn(s.box)}>
        {imageUrl ? <AvatarImage source={{ uri: imageUrl }} /> : null}
        <AvatarFallback className={solid ? 'bg-primary' : 'bg-accent'}>
          <Text
            className={cn(
              'font-semibold',
              s.text,
              solid ? 'text-primary-foreground' : 'text-accent-foreground',
            )}
          >
            {initials(name)}
          </Text>
        </AvatarFallback>
      </Avatar>
      {online ? (
        <View className="bg-success border-card absolute bottom-0 right-0 h-3 w-3 rounded-full border-2" />
      ) : null}
    </View>
  );
}
