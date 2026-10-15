import { Check, type LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { MENU_WIDTH, type MenuPlacement } from '../lib/menuPlacement';
import { Divider } from '../primitives/Divider';
import { Icon } from '../primitives/Icon';
import { Pressable } from '../primitives/Pressable';
import { Surface } from '../primitives/Surface';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';
import { useReduceMotion } from '../theme/useReduceMotion';
import { springConfig } from '../tokens/motion';

export interface MenuCardItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  destructive?: boolean;
  /** Pull-down menus mark the current choice with a check. */
  checked?: boolean;
  onPress: () => void;
}

/**
 * The raised card of a context menu or pull-down: rows of at least 48pt with
 * the label first, then its icon (or, for a choice, a check before the label).
 * It springs out of the anchor edge; under reduced motion it just appears.
 */
export function MenuCard({
  items,
  placement,
  showChecks,
  label,
}: {
  items: MenuCardItem[];
  placement: MenuPlacement;
  /** Reserve a leading check column (pull-down choices). */
  showChecks?: boolean;
  label?: string;
}) {
  const depth = useDepth();
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  React.useEffect(() => {
    progress.value = withSpring(1, springConfig('snappy'));
  }, [progress]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.88 + 0.12 * progress.value }],
  }));
  return (
    <Animated.View
      accessibilityViewIsModal
      accessibilityLabel={label}
      style={[
        {
          position: 'absolute',
          top: placement.top,
          left: placement.left,
          width: MENU_WIDTH,
          transformOrigin: placement.above ? 'bottom left' : 'top left',
        },
        reduceMotion ? null : style,
      ]}
    >
      <Surface variant="floating" radius={18} className="overflow-hidden py-1">
        {items.map((item, index) => {
          const color = item.destructive
            ? depth.colors.destructiveText
            : depth.colors.label;
          return (
            <View key={item.key}>
              {index > 0 ? <Divider inset={showChecks ? 44 : 16} /> : null}
              <Pressable
                onPress={item.onPress}
                accessibilityRole="menuitem"
                accessibilityLabel={item.label}
                accessibilityState={
                  item.checked === undefined
                    ? undefined
                    : { checked: item.checked }
                }
                style={({ pressed }) =>
                  pressed ? depth.rowPressed : undefined
                }
                className="min-h-12 flex-row items-center gap-3 px-4"
              >
                {showChecks ? (
                  <View className="w-5 items-center">
                    {item.checked ? (
                      <Icon
                        as={Check}
                        size={18}
                        strokeWidth={2.6}
                        color={depth.colors.tint}
                      />
                    ) : null}
                  </View>
                ) : null}
                <Text
                  numberOfLines={1}
                  style={{ color }}
                  className="min-w-0 flex-1 text-title"
                >
                  {item.label}
                </Text>
                {item.icon ? (
                  <Icon
                    as={item.icon}
                    size={20}
                    strokeWidth={1.8}
                    color={color}
                  />
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </Surface>
    </Animated.View>
  );
}
