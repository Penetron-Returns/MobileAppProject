import { useSyncExternalStore } from 'react';

import i18n from '@/lib/i18n';

import { isApiError } from './api';

export type ToastKind = 'success' | 'error' | 'info';
export interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
  requestId?: string | null;
}

let items: ToastItem[] = [];
let seq = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function push(t: Omit<ToastItem, 'id'>, ttl = 4500) {
  const id = seq++;
  items = [...items.slice(-2), { ...t, id }];
  emit();
  setTimeout(() => dismiss(id), ttl);
  return id;
}

export function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

/** Human message for an error, preferring API codes we know about. */
export function errorMessage(error: unknown): string {
  if (isApiError(error)) {
    const key = `errors.codes.${error.code}`;
    const translated = i18n.exists(key) ? i18n.t(key) : null;
    return translated ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return i18n.t('errors.generic');
}

export const toast = {
  success: (title: string, description?: string) =>
    push({ kind: 'success', title, description }),
  info: (title: string, description?: string) =>
    push({ kind: 'info', title, description }),
  error: (error: unknown, title?: string) =>
    push(
      {
        kind: 'error',
        title: title ?? errorMessage(error),
        description: title ? errorMessage(error) : undefined,
        requestId: isApiError(error) ? error.requestId : null,
      },
      7000,
    ),
};

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
