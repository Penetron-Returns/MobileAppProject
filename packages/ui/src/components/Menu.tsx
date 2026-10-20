import * as React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '../lib/haptics';
import {
  MENU_WIDTH,
  estimateMenuHeight,
  placeMenu,
  type Rect,
} from '../lib/menuPlacement';
import { useDsText } from '../lib/strings';
import { Pressable } from '../primitives/Pressable';
import { MenuCard } from './MenuCard';
import { MenuOverlay } from './MenuOverlay';

export interface MenuOption<V extends string> {
  value: V;
  label: string;
}

export interface MenuProps<V extends string> {
  options: MenuOption<V>[];
  selected: V | null;
  onSelect: (value: V) => void;
  /** Spoken name of the control ("Staff, Thandi"). */
  accessibilityLabel: string;
  /** Which edge of the control the card lines up with. */
  align?: 'start' | 'end';
  className?: string;
  /** The control: what the user sees and taps. */
  children: React.ReactNode;
}

/**
 * SwiftUI `Picker(.menu)`: tapping the control opens a pull-down card anchored
 * to it, with the current choice checked. Choosing closes it, with a selection
 * haptic. For choices that would otherwise take a screen or a long segmented
 * control.
 */
export function Menu<V extends string>({
  options,
  selected,
  onSelect,
  accessibilityLabel,
  align = 'start',
  className,
  children,
}: MenuProps<V>) {
  const t = useDsText();
  const anchor = React.useRef<View>(null);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const [open, setOpen] = React.useState(false);
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const show = () => {
    anchor.current?.measureInWindow((x, y, width, height) => {
      setRect({ x, y, width, height });
      setOpen(true);
    });
  };

  return (
    <>
      <View ref={anchor} collapsable={false}>
        <Pressable
          onPress={show}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ expanded: open }}
          className={className}
        >
          {children}
        </Pressable>
      </View>
      <MenuOverlay
        open={open}
        onClose={() => setOpen(false)}
        closeLabel={t('common.dismiss')}
      >
        {rect ? (
          <MenuCard
            showChecks
            label={accessibilityLabel}
            placement={placeMenu({
              anchor: rect,
              menu: {
                width: MENU_WIDTH,
                height: estimateMenuHeight(options.length),
              },
              screen,
              insets,
              align,
            })}
            items={options.map((option) => ({
              key: option.value,
              label: option.label,
              checked: option.value === selected,
              onPress: () => {
                setOpen(false);
                if (option.value !== selected) {
                  haptics.selection();
                  onSelect(option.value);
                }
              },
            }))}
          />
        ) : null}
      </MenuOverlay>
    </>
  );
}
