import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Runs one haptic call: a no-op on the web, and never throws or rejects. */
function fire(play: () => Promise<void>): void {
  if (Platform.OS === 'web') return;
  try {
    void play().catch(() => {});
  } catch {
    // No haptic engine (simulator, old device): nothing to do.
  }
}

/**
 * SwiftUI `.sensoryFeedback` for the app. Fire-and-forget and safe anywhere;
 * call at most one per user action, and never instead of visible feedback.
 */
export const haptics = {
  /** A value changed: tab, segment, picker or wheel tick, day pick. */
  selection: () => fire(() => Haptics.selectionAsync()),
  /** A light tap: toggle, chip select, primary button press. */
  light: () =>
    fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A save or booking succeeded. */
  success: () =>
    fire(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    ),
  /** Input was blocked: validation failed, the slot was just taken. */
  warning: () =>
    fire(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
    ),
  /** An action failed. */
  error: () =>
    fire(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    ),
} as const;
