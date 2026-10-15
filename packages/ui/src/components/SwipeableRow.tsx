import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import {
  runOnJS,
  useAnimatedReaction,
  type SharedValue,
} from 'react-native-reanimated';

import { haptics } from '../lib/haptics';
import { Icon } from '../primitives/Icon';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';
import { RowActionsProvider, useIsRowPreview } from './RowActions';

/** Width of one revealed action, as on a SwiftUI list row. */
const ACTION_WIDTH = 88;
/** Past this share of the row width the first action fires on release. */
const FULL_SWIPE_FRACTION = 0.55;

export interface SwipeAction {
  /** Stable id; also the accessibility action name. */
  key: string;
  /** Short, fits the 88pt button ("Delete"). */
  label: string;
  /** Spoken name when the button label is short ("Remove Joy from the team"). */
  spokenLabel?: string;
  /** `destructive` is system red; `default` is the tint. */
  role?: 'destructive' | 'default';
  icon?: LucideIcon;
  onPress: () => void;
}

export interface SwipeableRowProps {
  /** Trailing actions, outermost first (the one a full swipe triggers). */
  trailing: SwipeAction[];
  /** Turn swiping off (read-only people, the owner's own row) without remounting. */
  enabled?: boolean;
  children: React.ReactNode;
}

/**
 * SwiftUI `.swipeActions`: drag a row left to reveal trailing actions in red
 * (destructive) or tint, and drag past half the row to trigger the first one,
 * with a light haptic when the threshold is crossed. Every action is also an
 * accessibility action on the row, so it never depends on the gesture.
 *
 * Actions that need confirmation open their dialog in `onPress`; the row
 * closes itself afterwards, so nothing is ever deleted by the swipe alone.
 */
export function SwipeableRow({
  trailing,
  enabled = true,
  children,
}: SwipeableRowProps) {
  const depth = useDepth();
  const isPreview = useIsRowPreview();
  const swipeable = React.useRef<SwipeableMethods>(null);
  const armed = React.useRef(false);
  const [width, setWidth] = React.useState(0);
  const threshold = Math.max(
    ACTION_WIDTH * trailing.length * 1.3,
    width * FULL_SWIPE_FRACTION,
  );

  const actions = React.useMemo(
    () =>
      trailing.map((a) => ({
        name: a.key,
        label: a.spokenLabel ?? a.label,
        onPress: a.onPress,
      })),
    [trailing],
  );

  if (isPreview || !enabled || trailing.length === 0) return <>{children}</>;

  const run = (action: SwipeAction) => {
    swipeable.current?.close();
    action.onPress();
  };

  return (
    <RowActionsProvider actions={actions}>
      <ReanimatedSwipeable
        ref={swipeable}
        friction={2}
        rightThreshold={ACTION_WIDTH / 2}
        overshootRight
        overshootFriction={8}
        dragOffsetFromRightEdge={16}
        containerStyle={{ overflow: 'hidden' }}
        onSwipeableOpenStartDrag={() => {
          armed.current = false;
        }}
        onSwipeableWillOpen={(direction) => {
          if (direction === 'right' && armed.current) run(trailing[0]);
          armed.current = false;
        }}
        renderRightActions={(_progress, translation) => (
          <ActionsPanel
            actions={trailing}
            translation={translation}
            threshold={threshold}
            onArm={(next) => {
              if (next && !armed.current) haptics.light();
              armed.current = next;
            }}
            onPress={run}
          />
        )}
      >
        <View
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          // Opaque, so the red under the row never shows through it.
          style={{ backgroundColor: depth.raised.backgroundColor }}
        >
          {children}
        </View>
      </ReanimatedSwipeable>
    </RowActionsProvider>
  );
}

function ActionsPanel({
  actions,
  translation,
  threshold,
  onArm,
  onPress,
}: {
  actions: SwipeAction[];
  translation: SharedValue<number>;
  threshold: number;
  onArm: (armed: boolean) => void;
  onPress: (action: SwipeAction) => void;
}) {
  const depth = useDepth();
  useAnimatedReaction(
    () => Math.abs(translation.value) >= threshold,
    (isArmed, previous) => {
      if (isArmed !== previous) runOnJS(onArm)(isArmed);
    },
    [threshold],
  );
  const fill = (action: SwipeAction) =>
    action.role === 'destructive' ? depth.colors.red : depth.colors.tint;
  return (
    <View className="flex-row">
      {/* A full swipe pulls the row past the buttons: the first colour fills the gap. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: -2000,
          right: 0,
          backgroundColor: fill(actions[0]),
        }}
      />
      {actions.map((action) => (
        <Pressable
          key={action.key}
          feedback="dim"
          onPress={() => onPress(action)}
          accessibilityRole="button"
          accessibilityLabel={action.spokenLabel ?? action.label}
          style={{ width: ACTION_WIDTH, backgroundColor: fill(action) }}
          className="items-center justify-center gap-1"
        >
          {action.icon ? (
            <Icon
              as={action.icon}
              size={22}
              color={depth.colors.onFill}
              strokeWidth={2}
            />
          ) : null}
          <Text
            numberOfLines={1}
            style={{ color: depth.colors.onFill }}
            className="px-1 text-meta font-semibold"
          >
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
