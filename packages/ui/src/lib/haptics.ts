import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as React from 'react';
import { Platform } from 'react-native';

const STORAGE_KEY = 'clovie.haptics.enabled';

/** The user's Settings switch. On by default; stored so it survives restarts. */
let enabled = true;
let hydrated = false;
const listeners = new Set<() => void>();

function publish(next: boolean) {
  if (next === enabled) return;
  enabled = next;
  listeners.forEach((notify) => notify());
}

/** Reads the saved choice once. A choice made before it arrives wins. */
function hydrate() {
  if (hydrated) return;
  hydrated = true;
  AsyncStorage.getItem(STORAGE_KEY)
    .then((saved) => {
      if (saved !== null && hydrated) publish(saved === 'true');
    })
    .catch(() => {});
}

export function getHapticsEnabled(): boolean {
  hydrate();
  return enabled;
}

export function setHapticsEnabled(next: boolean): void {
  hydrated = true;
  publish(next);
  void AsyncStorage.setItem(STORAGE_KEY, String(next)).catch(() => {});
}

/** Settings hook: `[isOn, setOn]` for the "Haptic feedback" switch. */
export function useHapticsEnabled(): readonly [
  boolean,
  (next: boolean) => void,
] {
  const value = React.useSyncExternalStore(
    (notify) => {
      hydrate();
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
    getHapticsEnabled,
    () => true,
  );
  return [value, setHapticsEnabled] as const;
}

/** Test helper. */
export function resetHapticsForTests(): void {
  enabled = true;
  hydrated = false;
  listeners.clear();
}

/** Runs one haptic call: a no-op on the web or when switched off, and never throws or rejects. */
function fire(play: () => Promise<void>): void {
  if (Platform.OS === 'web' || !getHapticsEnabled()) return;
  try {
    void play().catch(() => {});
  } catch {
    // No haptic engine (simulator, old device): nothing to do.
  }
}

/**
 * SwiftUI `.sensoryFeedback` for the app. Fire-and-forget and safe anywhere;
 * call at most one per user action, and never instead of visible feedback.
 * Rule: `selection` for tab and segment changes, `light` for primary actions,
 * success/warning/error for outcomes, nothing for passive navigation.
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
