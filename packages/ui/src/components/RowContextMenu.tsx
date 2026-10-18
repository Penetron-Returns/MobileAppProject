import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '../lib/haptics';
import { useDsText } from '../lib/strings';
import {
  MENU_WIDTH,
  estimateMenuHeight,
  placeMenu,
  type Rect,
} from '../lib/menuPlacement';
import { Surface } from '../primitives/Surface';
import { useReduceMotion } from '../theme/useReduceMotion';
import { springConfig } from '../tokens/motion';
import { MenuCard } from './MenuCard';
import { MenuOverlay, useDeferredAction } from './MenuOverlay';
import {
  RowActionsProvider,
  RowActionsReset,
  type RowAction,
} from './RowActions';

/** The preview grows by this much when it lifts. */
const LIFT_SCALE = 1.03;

export interface RowContextMenuAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  destructive?: boolean;
  onPress: () => void;
}

export interface RowContextMenuProps {
  actions: RowContextMenuAction[];
  /** Corner radius of the lifted preview: 22 for list rows, 12 for calendar blocks. */
  previewRadius?: number;
  /** Turn the menu off (read-only rows) without remounting. */
  enabled?: boolean;
  children: React.ReactNode;
}

/**
 * SwiftUI `.contextMenu`: a long press lifts the row (a light haptic, a slight
 * scale), dims and blurs the screen behind it and shows a raised card of
 * actions next to it. The row must consume `useRowActionProps()` (`GroupRow`
 * does) so its own press handling hands the long press up; the same actions
 * are also its accessibility actions. An action runs after the menu has gone,
 * so navigating from it works; a destructive action should still confirm.
 */
export function RowContextMenu({
  actions,
  previewRadius = 22,
  enabled = true,
  children,
}: RowContextMenuProps) {
  const t = useDsText();
  const anchor = React.useRef<View>(null);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const [open, setOpen] = React.useState(false);
  const { defer, flush } = useDeferredAction();

  const openMenu = React.useCallback(() => {
    anchor.current?.measureInWindow((x, y, width, height) => {
      haptics.light();
      setRect({ x, y, width, height });
      setOpen(true);
    });
  }, []);

  const rowActions = React.useMemo<RowAction[]>(
    () =>
      actions.map((a) => ({ name: a.key, label: a.label, onPress: a.onPress })),
    [actions],
  );

  if (!enabled || actions.length === 0) return <>{children}</>;

  return (
    <RowActionsProvider actions={rowActions} openMenu={openMenu}>
      <View ref={anchor} collapsable={false}>
        {children}
      </View>
      {/* The modal is mounted on first use: a calendar can hold hundreds of rows, each with a menu. */}
      {rect ? (
        <MenuOverlay
          open={open}
          onClose={() => setOpen(false)}
          onDismissed={flush}
          closeLabel={t('common.dismiss')}
        >
          {rect ? (
            <Lifted
              rect={rect}
              actions={actions}
              previewRadius={previewRadius}
              onChoose={(action) => {
                setOpen(false);
                defer(action.onPress);
              }}
            >
              {children}
            </Lifted>
          ) : null}
        </MenuOverlay>
      ) : null}
    </RowActionsProvider>
  );
}

function Lifted({
  rect,
  actions,
  previewRadius,
  onChoose,
  children,
}: {
  rect: Rect;
  actions: RowContextMenuAction[];
  previewRadius: number;
  onChoose: (action: RowContextMenuAction) => void;
  children: React.ReactNode;
}) {
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(reduceMotion ? LIFT_SCALE : 1);
  React.useEffect(() => {
    scale.value = withSpring(LIFT_SCALE, springConfig('snappy'));
  }, [scale]);
  const lift = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const placement = placeMenu({
    anchor: rect,
    menu: { width: MENU_WIDTH, height: estimateMenuHeight(actions.length) },
    screen,
    insets,
    align: 'end',
  });
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
          },
          lift,
        ]}
      >
        <Surface
          variant="floating"
          radius={previewRadius}
          style={{ overflow: 'hidden' }}
        >
          <RowActionsReset>{children}</RowActionsReset>
        </Surface>
      </Animated.View>
      <MenuCard
        label={actions.map((a) => a.label).join(', ')}
        placement={placement}
        items={actions.map((a) => ({
          ...a,
          onPress: () => onChoose(a),
        }))}
      />
    </>
  );
}
