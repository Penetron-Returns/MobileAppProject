import { Pressable, Text } from '@booking/ui';
import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { TYPE, useOnbColors } from '../theme';

type Variant = 'primary' | 'secondary' | 'link';

/**
 * The boards' three buttons: a 56pt blue pill, a 56pt white pill with a blue
 * label, and a 44pt text link. A disabled primary is flat grey, no shadow.
 */
export function OnbButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon: Icon,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  accessibilityLabel?: string;
}) {
  const c = useOnbColors();
  const isPrimary = variant === 'primary';
  const isLink = variant === 'link';
  const off = disabled && isPrimary;
  const color = off ? c.disabledText : isPrimary ? c.onFill : c.tint;
  return (
    <Pressable
      feedback={isLink ? 'dim' : 'nudge'}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={{
        height: isLink ? 44 : 56,
        borderRadius: 28,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: isLink
          ? 'transparent'
          : off
            ? c.disabledFill
            : isPrimary
              ? c.tint
              : c.surface,
        borderWidth: variant === 'secondary' ? 0.5 : 0,
        borderColor: c.ring,
      }}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        // Keyed by the label, so a changed label (the plan button) cross-fades in 150ms.
        <Animated.View
          key={label}
          entering={FadeIn.duration(150).reduceMotion(ReduceMotion.System)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          {Icon ? <Icon size={20} strokeWidth={2} color={color} /> : null}
          <Text style={[isLink ? TYPE.link : TYPE.button, { color }]}>
            {label}
          </Text>
        </Animated.View>
      )}
    </Pressable>
  );
}
