import { ChevronRight } from 'lucide-react-native';
import * as React from 'react';
import {
  View,
  type PressableStateCallbackType,
  type ViewProps,
} from 'react-native';

import { cn } from '../lib/cn';
import { Divider } from '../primitives/Divider';
import { Pressable } from '../primitives/Pressable';
import { Surface } from '../primitives/Surface';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';
import { Avatar } from './Avatar';
import { useRowActionProps } from './RowActions';
import type { GlyphComponent } from './Glyph';

/** Section heading (22/28 bold) above a group, 4pt clear of it. */
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
      className={cn('mx-5 mb-1 mt-7 text-section font-bold', className)}
    >
      {children}
    </Text>
  );
}

export interface GroupProps extends ViewProps {
  /** Corner radius: the lists of people and services use 22, cards 26. */
  radius?: number;
}

/** A raised, rounded container whose rows are separated by engraved lines. */
export function Group({ className, children, radius, ...props }: GroupProps) {
  return (
    <Surface
      variant="raised"
      radius={radius}
      className={cn('mx-5 overflow-hidden', className)}
      {...props}
    >
      {children}
    </Surface>
  );
}

/**
 * A custom row inside a `Group` (a field row, a stepper, a block of chips):
 * relative, with the engraved line above it when it is not the first.
 */
export function GroupBlock({
  showSeparator,
  className,
  children,
  ...props
}: ViewProps & { showSeparator?: boolean }) {
  return (
    <View className={cn('relative', className)} {...props}>
      {showSeparator ? <Divider /> : null}
      {children}
    </View>
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
  /**
   * Shown but not usable: dimmed, no chevron, not pressable. Settings are never hidden, so a
   * row the person cannot use says why in `reason` (shown as the line under the title).
   */
  disabled?: boolean;
  reason?: string;
  /** Ring colour of the avatar (a team member's calendar colour). */
  avatarRing?: string | null;
}

/** A row leads with a plain glyph or a person's avatar, never both. */
export type GroupRowProps = GroupRowBaseProps &
  (
    | { icon?: GlyphComponent; avatarName?: never }
    | { avatarName: string | null; icon?: never }
  );

/**
 * One row of a `Group`: optional glyph or avatar, title, detail and chevron.
 * Metrics follow the boards: a glyph row is 56pt with 14pt gaps, an avatar row
 * 64pt with 12pt gaps, a text row 60pt (56pt without a second line).
 * Pressable when `onPress` is set.
 */
export function GroupRow({
  title,
  detail,
  detailTone = 'secondary',
  icon: IconGlyph,
  avatarName,
  avatarRing,
  subtitle,
  onPress,
  trailing,
  showSeparator,
  accessibilityLabel,
  destructive,
  disabled,
  reason,
}: GroupRowProps) {
  const depth = useDepth();
  // Swipe / long-press actions of an enclosing SwipeableRow or ContextMenu.
  const rowActions = useRowActionProps();
  const hasAvatar = avatarName !== undefined;
  const body = (
    <>
      {showSeparator ? (
        <Divider inset={hasAvatar ? 72 : IconGlyph ? 50 : 16} />
      ) : null}
      {hasAvatar ? <Avatar name={avatarName} ring={avatarRing} /> : null}
      {IconGlyph ? (
        <IconGlyph size={20} strokeWidth={1.8} color={depth.colors.secondary} />
      ) : null}
      {/* The title never truncates: a plain row lets the detail give way first. */}
      <View
        className={
          subtitle || (disabled && reason) ? 'min-w-0 flex-1' : 'shrink-0 grow'
        }
      >
        <Text className={cn('text-title', destructive && 'text-destructive')}>
          {title}
        </Text>
        {subtitle || (disabled && reason) ? (
          <Text
            numberOfLines={1}
            style={{ fontVariant: ['tabular-nums'] }}
            className="text-subtitle text-muted-foreground"
          >
            {disabled && reason ? reason : subtitle}
          </Text>
        ) : null}
      </View>
      {detail ? (
        <Text
          numberOfLines={1}
          style={[
            { fontVariant: ['tabular-nums'] },
            detailTone === 'success' ? { color: depth.colors.green } : null,
          ]}
          className={cn(
            'shrink max-w-[60%] text-title',
            detailTone === 'secondary' && 'text-muted-foreground',
          )}
        >
          {detail}
        </Text>
      ) : null}
      {trailing ??
        (onPress && !disabled ? (
          <ChevronRight
            size={14}
            strokeWidth={2.8}
            color={depth.colors.secondary}
          />
        ) : null)}
    </>
  );

  const className = cn(
    'relative flex-row items-center px-4',
    hasAvatar && 'min-h-16 gap-3 py-1.5',
    IconGlyph && 'min-h-14 gap-3.5 py-2',
    !hasAvatar && !IconGlyph && 'gap-2.5 py-1.5',
    !hasAvatar &&
      !IconGlyph &&
      (subtitle || (disabled && reason) ? 'min-h-[60px]' : 'min-h-14'),
  );
  if (disabled) {
    return (
      <View
        accessible
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        accessibilityLabel={
          accessibilityLabel ??
          [title, detail, reason].filter(Boolean).join(', ')
        }
        style={{ opacity: 0.55 }}
        className={className}
      >
        {body}
      </View>
    );
  }
  if (!onPress) {
    return <View className={className}>{body}</View>;
  }
  return (
    <Pressable
      feedback="none"
      onPress={onPress}
      {...rowActions}
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? (detail ? `${title}, ${detail}` : title)
      }
      style={({ pressed }: PressableStateCallbackType) =>
        pressed ? depth.rowPressed : undefined
      }
      className={className}
    >
      {body}
    </Pressable>
  );
}
