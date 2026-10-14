import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View, type ViewProps } from 'react-native';

import { Surface } from '@/components/Surface';
import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';
import { cn } from '@/lib/utils';

/** Section heading (22/28 bold) above a group. */
export function SectionTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Text
      role="heading"
      aria-level="2"
      className={cn('mx-5 mb-2 mt-7 text-section font-bold', className)}
    >
      {children}
    </Text>
  );
}

/** A raised, rounded container whose rows are separated by engraved lines. */
export function Group({ className, children, ...props }: ViewProps) {
  return (
    <Surface
      variant="raised"
      className={cn('mx-5 overflow-hidden', className)}
      {...props}
    >
      {children}
    </Surface>
  );
}

interface GroupRowProps {
  title: string;
  /** Quiet text before the chevron ("14", "Connected"). */
  detail?: string;
  detailTone?: 'secondary' | 'success';
  icon?: LucideIcon;
  /** Line under the title. */
  subtitle?: string;
  onPress?: () => void;
  /** Replaces the chevron (a switch, a capsule). */
  trailing?: React.ReactNode;
  showSeparator?: boolean;
  /** Overrides the default "title, detail" spoken label. */
  accessibilityLabel?: string;
  destructive?: boolean;
}

/** One 56pt row: optional glyph, title, detail and chevron. Pressable when `onPress` is set. */
export function GroupRow({
  title,
  detail,
  detailTone = 'secondary',
  icon: IconGlyph,
  subtitle,
  onPress,
  trailing,
  showSeparator,
  accessibilityLabel,
  destructive,
}: GroupRowProps) {
  const depth = useDepth();
  const body = (
    <>
      {showSeparator ? (
        <Surface
          variant="engrave"
          className={cn(
            'absolute right-0 top-0 h-0.5',
            IconGlyph ? 'left-[52px]' : 'left-4',
          )}
        />
      ) : null}
      {IconGlyph ? (
        <IconGlyph size={22} strokeWidth={1.8} color={depth.colors.secondary} />
      ) : null}
      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={1}
          className={cn('text-title', destructive && 'text-destructive')}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={2}
            className="text-subtitle text-muted-foreground"
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {detail ? (
        <Text
          numberOfLines={1}
          style={
            detailTone === 'success' ? { color: depth.colors.green } : undefined
          }
          className={cn(
            'max-w-[45%] text-subtitle',
            detailTone === 'secondary' && 'text-muted-foreground',
          )}
        >
          {detail}
        </Text>
      ) : null}
      {trailing ??
        (onPress ? (
          <ChevronRight
            size={16}
            strokeWidth={2.8}
            color={depth.colors.secondary}
          />
        ) : null)}
    </>
  );

  const className = 'min-h-14 flex-row items-center gap-3 px-4 py-1.5';
  if (!onPress) {
    return <View className={className}>{body}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? (detail ? `${title}, ${detail}` : title)
      }
      className={cn(className, 'active:bg-muted')}
    >
      {body}
    </Pressable>
  );
}
