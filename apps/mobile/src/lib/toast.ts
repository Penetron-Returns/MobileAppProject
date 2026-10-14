import { showToast } from '@booking/ui';

import i18n from '@/lib/i18n';

import { isApiError } from './api';

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

/**
 * What the design system's error components need from an error: the message
 * and the API request id. Spread it: `<ErrorState {...describeError(e)} />`.
 */
export function describeError(error: unknown): {
  message: string;
  requestId: string | null;
} {
  return {
    message: errorMessage(error),
    requestId: isApiError(error) ? error.requestId : null,
  };
}

/** Toasts that know how to read an API error (the design system only shows them). */
export const toast = {
  success: (title: string, description?: string) =>
    showToast({ kind: 'success', title, description }),
  info: (title: string, description?: string) =>
    showToast({ kind: 'info', title, description }),
  /** A fixed message (already translated) that still carries the API request id. */
  failed: (message: string, error?: unknown) =>
    showToast({
      kind: 'error',
      title: message,
      requestId: isApiError(error) ? error.requestId : null,
    }),
  error: (error: unknown, title?: string) =>
    showToast({
      kind: 'error',
      title: title ?? errorMessage(error),
      description: title ? errorMessage(error) : undefined,
      requestId: isApiError(error) ? error.requestId : null,
    }),
};
