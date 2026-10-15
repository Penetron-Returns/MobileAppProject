import { BlurView } from 'expo-blur';
import * as React from 'react';
import {
  Modal,
  Platform,
  Pressable as RNPressable,
  StyleSheet,
  View,
} from 'react-native';

import { useDepth } from '../theme/useDepth';

/**
 * The full-screen layer behind a menu: a dimmed, blurred backdrop that closes
 * the menu when tapped, with the menu's own content on top. A native `Modal`,
 * so it covers the tab bar and works inside sheets.
 */
export function MenuOverlay({
  open,
  onClose,
  onDismissed,
  closeLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** The modal is fully gone (iOS only; see `useDeferredAction`). */
  onDismissed?: () => void;
  closeLabel: string;
  children: React.ReactNode;
}) {
  const depth = useDepth();
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
      onDismiss={onDismissed}
    >
      <View style={StyleSheet.absoluteFill}>
        <RNPressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: depth.scrim }]}
        >
          {Platform.OS === 'ios' ? (
            <BlurView
              intensity={18}
              tint={
                depth.scheme === 'dark'
                  ? 'systemChromeMaterialDark'
                  : 'systemChromeMaterialLight'
              }
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          ) : null}
        </RNPressable>
        {children}
      </View>
    </Modal>
  );
}

/** Safety net for iOS, where `onDismiss` can be missed if the host unmounts. */
const FALLBACK_MS = 600;

/**
 * Runs a menu choice only after the menu's modal has left the screen. On iOS
 * a navigation push or a dialog started while a modal is still dismissing is
 * silently dropped, so the choice waits for `onDismiss` there (with a timer as
 * a backstop). Elsewhere it runs on the next tick.
 */
export function useDeferredAction() {
  const pending = React.useRef<(() => void) | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const run = pending.current;
    pending.current = null;
    run?.();
  }, []);

  const defer = React.useCallback(
    (run: () => void) => {
      pending.current = run;
      timer.current = setTimeout(
        flush,
        Platform.OS === 'ios' ? FALLBACK_MS : 0,
      );
    },
    [flush],
  );

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { defer, flush };
}
