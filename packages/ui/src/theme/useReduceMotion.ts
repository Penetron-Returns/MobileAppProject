import * as React from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * The OS "reduce motion" setting as one module-level store: a single bridge
 * call and listener for the whole app, and every reader gets the current value
 * synchronously (no per-component state, effect or extra render).
 */
let current = false;
let started = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (next === current) return;
  current = next;
  listeners.forEach((notify) => notify());
}

function start() {
  if (started) return;
  started = true;
  AccessibilityInfo.isReduceMotionEnabled?.()
    .then(set)
    .catch(() => {});
  AccessibilityInfo.addEventListener?.('reduceMotionChanged', set);
}

/** Reads the setting outside React (the first read starts listening). */
export function getReduceMotion(): boolean {
  start();
  return current;
}

function subscribe(notify: () => void) {
  start();
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/**
 * True when the OS asks for reduced motion. For animation that does not go
 * through Reanimated (CSS-style `animate-*` classes); Reanimated animations
 * use `ReduceMotion.System` instead.
 */
export function useReduceMotion(): boolean {
  return React.useSyncExternalStore(subscribe, getReduceMotion, () => false);
}

/** Test helper: forget the store so the next reader starts it afresh. */
export function resetReduceMotionForTests(): void {
  current = false;
  started = false;
  listeners.clear();
}
