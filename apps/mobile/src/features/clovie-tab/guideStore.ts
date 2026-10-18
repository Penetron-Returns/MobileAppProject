import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';

/**
 * Whether the owner has opened the Guide story. Device-local on purpose: the
 * Guide is client-side content, so there is nothing to tell the backend. The
 * ring stays "new" until it has been opened once.
 */
export const GUIDE_VIEWED_KEY = 'clovie.guide.viewed.v1';

interface GuideState {
  isLoaded: boolean;
  isViewed: boolean;
}

let state: GuideState = { isLoaded: false, isViewed: false };
let isLoading = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const set = (next: GuideState) => {
  state = next;
  emit();
};

function load() {
  if (state.isLoaded || isLoading) return;
  isLoading = true;
  AsyncStorage.getItem(GUIDE_VIEWED_KEY)
    .then((raw) =>
      // Opened while this was loading stays opened.
      set({ isLoaded: true, isViewed: raw === '1' || state.isViewed }),
    )
    .catch(() => set({ isLoaded: true, isViewed: state.isViewed }))
    .finally(() => {
      isLoading = false;
    });
}

export function markGuideViewed() {
  if (state.isViewed) return;
  set({ ...state, isViewed: true });
  try {
    AsyncStorage.setItem(GUIDE_VIEWED_KEY, '1').catch(() => undefined);
  } catch {
    // Storage unavailable: the ring resets next launch, nothing breaks.
  }
}

/** Test hook: forget everything in memory. */
export function resetGuideStore() {
  state = { isLoaded: false, isViewed: false };
  isLoading = false;
  emit();
}

export function useGuideViewed(): GuideState {
  const current = React.useSyncExternalStore(subscribe, () => state);
  React.useEffect(load, []);
  return current;
}
