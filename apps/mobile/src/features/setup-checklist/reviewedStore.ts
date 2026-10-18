import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';

import {
  parseReviewed,
  serializeReviewed,
  type ChecklistItemId,
} from './logic';

/**
 * Which checklist items the owner has opened, per business, shared by every
 * screen that shows the checklist (the Clovie tab story, the Settings row and
 * the list itself). Each screen used to keep its own copy, so marking an item
 * on the list never reached the story or the row, which stay mounted in tabs.
 */
type Reviewed = ReadonlySet<ChecklistItemId>;
const EMPTY: Reviewed = new Set();
const cache = new Map<string, Reviewed>();
const loading = new Set<string>();
const listeners = new Set<() => void>();

const keyFor = (businessId: string) => `checklist.reviewed.v1.${businessId}`;
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

function load(businessId: string) {
  if (cache.has(businessId) || loading.has(businessId)) return;
  loading.add(businessId);
  AsyncStorage.getItem(keyFor(businessId))
    .then((raw) => {
      // Anything marked while this was loading stays.
      const merged = new Set([
        ...parseReviewed(raw),
        ...(cache.get(businessId) ?? []),
      ]);
      cache.set(businessId, merged);
      emit();
    })
    .catch(() => undefined)
    .finally(() => loading.delete(businessId));
}

/** Test hook: forget everything in memory. */
export function resetReviewedStore() {
  cache.clear();
  loading.clear();
  emit();
}

export function useReviewed(businessId: string | undefined) {
  const reviewed = React.useSyncExternalStore(subscribe, () =>
    businessId ? (cache.get(businessId) ?? EMPTY) : EMPTY,
  );
  React.useEffect(() => {
    if (businessId) load(businessId);
  }, [businessId]);

  const markReviewed = React.useCallback(
    (id: ChecklistItemId) => {
      if (!businessId) return;
      const current = cache.get(businessId) ?? EMPTY;
      if (current.has(id)) return;
      const next = new Set(current).add(id);
      cache.set(businessId, next);
      emit();
      AsyncStorage.setItem(keyFor(businessId), serializeReviewed(next)).catch(
        () => undefined,
      );
    },
    [businessId],
  );
  return { reviewed, markReviewed };
}
