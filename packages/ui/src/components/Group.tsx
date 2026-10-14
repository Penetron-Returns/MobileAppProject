import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View, type ViewProps } from 'react-native';

import { cn } from '../lib/cn';
import { Divider } from '../primitives/Divider';
import { Surface } from '../primitives/Surface';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';
import { Avatar } from './Avatar';

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

interface GroupRowBaseProps {
  title: string;
  /** Quiet text before the chevron ("14", "Connected"). */
  detail?: string;
  detailTone?: 'secondary' | 'success';
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

/** A row leads with a plain glyph or a person's avatar, never both. */
export type GroupRowProps = GroupRowBaseProps &
  (
    | { icon?: LucideIcon; avatarName?: never }
    | { avatarName: string | null; icon?: never }
  );

/**
 * One row of a `Group`: optional glyph or avatar, title, detail and chevron.
 * 56pt tall (64pt with an avatar). Pressable when `onPress` is set.
 */
export function GroupRow({
  title,
  detail,
  detailTone = 'secondary',
  icon: IconGlyph,
  avatarName,
  subtitle,
  onPress,
  trailing,
  showSeparator,
  accessibilityLabel,
  destructive,
}: GroupRowProps) {
  const depth = useDepth();
  const hasAvatar = avatarName !== undefined;
  const body = (
    <>
      {showSeparator ? (
        <Divider inset={hasAvatar ? 68 : IconGlyph ? 52 : 16} />
      ) : null}
      {hasAvatar ? <Avatar name={avatarName} /> : null}
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

  const className = cn(
    'flex-row items-center gap-3 px-4 py-1.5',
    hasAvatar ? 'min-h-16 py-2' : 'min-h-14',
  );
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
