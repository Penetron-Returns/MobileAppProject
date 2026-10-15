import * as React from 'react';

import { DRAFT_READY_TIMEOUT_MS, type WidgetEvent } from './logic';

/**
 * Tracks whether the chat widget has reported `ready` for a draft we hand it.
 * If it has not within DRAFT_READY_TIMEOUT_MS, `isFallback` turns true so the
 * screen can show the text itself and it is never lost.
 */
export function useCompanionDraft(draft: string | undefined): {
  isFallback: boolean;
  onWidgetEvent: (event: WidgetEvent) => void;
} {
  const [isReady, setIsReady] = React.useState(false);
  const [isTimedOut, setIsTimedOut] = React.useState(false);
  const hasDraft = !!draft;

  React.useEffect(() => {
    if (!hasDraft || isReady) return;
    const timer = setTimeout(() => setIsTimedOut(true), DRAFT_READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [hasDraft, isReady]);

  const onWidgetEvent = React.useCallback((event: WidgetEvent) => {
    if (event.kind === 'ready') setIsReady(true);
  }, []);

  return { isFallback: hasDraft && isTimedOut && !isReady, onWidgetEvent };
}
