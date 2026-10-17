import type { StoryEventDTO } from '@booking/types';
import * as React from 'react';

import type { Story, StoryEvent } from '@/features/stories';
import { api, newIdempotencyKey } from '@/lib/api';

import { toEventDTO } from './storiesModel';

export const EVENT_FLUSH_MS = 10_000;
/** The API takes at most 50 events per call. */
const MAX_BATCH = 50;

/**
 * Batches the viewer's analytics events: sent 10 s after the first queued
 * one (no timer runs while nothing is queued) or when `flush` is called, e.g.
 * on close. Ids, kind and card index only. Analytics never block the UI, so a
 * failed batch is dropped.
 */
export function useStoryEvents(stories: readonly Story[]) {
  const queue = React.useRef<StoryEventDTO[]>([]);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = React.useRef(stories);
  latest.current = stories;

  const flush = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    while (queue.current.length > 0) {
      const events = queue.current.splice(0, MAX_BATCH);
      api
        .recordStoryEvents({ events }, newIdempotencyKey())
        .catch(() => undefined);
    }
  }, []);

  const record = React.useCallback(
    (event: StoryEvent) => {
      const dto = toEventDTO(event, latest.current, new Date());
      if (!dto) return;
      queue.current.push(dto);
      timer.current ??= setTimeout(flush, EVENT_FLUSH_MS);
    },
    [flush],
  );

  // Leaving the tab sends what is left.
  React.useEffect(() => flush, [flush]);

  return { record, flush };
}
