import { useSyncExternalStore } from 'react';

import { TOAST_TTL } from '../tokens/motion';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
  /** Support reference shown under an error (the API request id). */
  requestId?: string | null;
}

export type ToastInput = Omit<ToastItem, 'id'>;

let items: ToastItem[] = [];
let seq = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Removes a toast now. */
export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

/**
 * Shows a toast (at most three at a time) and removes it after `ttl`
 * milliseconds. App code usually calls the `toast` helper of its own error
 * layer; this is the design system's level.
 */
export function showToast(
  toast: ToastInput,
  ttl: number = toast.kind === 'error' ? TOAST_TTL.error : TOAST_TTL.default,
) {
  const id = seq++;
  items = [...items.slice(-2), { ...toast, id }];
  emit();
  setTimeout(() => dismissToast(id), ttl);
  return id;
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => items,
    () => items,
  );
}

/** Test helper: empties the queue. */
export function clearToasts() {
  items = [];
  emit();
}
