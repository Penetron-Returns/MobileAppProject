import type { StoriesResponseDTO } from '@booking/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Platform } from 'react-native';

import type { Story } from '@/features/stories';
import { api, newIdempotencyKey } from '@/lib/api';
import { qk } from '@/lib/query';

import {
  markViewedInData,
  PRODUCT_STORY_ID,
  toAppStories,
} from './storiesModel';

export const STORIES_STALE_MS = 5 * 60_000;

/** So the API can filter product updates by what this build can show. */
function storyHeaders(): Record<string, string> {
  return {
    'X-App-Version': Constants.expoConfig?.version ?? '',
    'X-Platform': Platform.OS,
  };
}

/**
 * The stories row's data: fresh for 5 minutes, refetched when the app comes
 * back to the foreground, and `markViewed` flips the ring at once (the API
 * call follows; a failure refetches the truth).
 */
export function useStories() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: qk.stories,
    queryFn: () => api.stories(storyHeaders()),
    staleTime: STORIES_STALE_MS,
  });

  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void queryClient.invalidateQueries({ queryKey: qk.stories });
      }
    });
    return () => sub.remove();
  }, [queryClient]);

  const { data, dataUpdatedAt } = query;
  const productTitle = t('clovieTab.productUpdates');
  const stories = React.useMemo<Story[]>(
    () =>
      data
        ? toAppStories(data, { productTitle, now: new Date(dataUpdatedAt) })
        : [],
    [data, dataUpdatedAt, productTitle],
  );

  const markViewed = React.useCallback(
    (storyId: string, lastCardIndex: number) => {
      const current = queryClient.getQueryData<StoriesResponseDTO>(qk.stories);
      if (!current) return;
      const isProduct = storyId === PRODUCT_STORY_ID;
      const request = isProduct
        ? api.markProductUpdatesViewed(
            { ids: current.productUpdates.cards.map((c) => c.id) },
            newIdempotencyKey(),
          )
        : api.markStoryViewed(storyId, { lastCardIndex }, newIdempotencyKey());
      queryClient.setQueryData(qk.stories, markViewedInData(current, storyId));
      request.catch(() => {
        void queryClient.invalidateQueries({ queryKey: qk.stories });
      });
    },
    [queryClient],
  );

  const isPaused = query.fetchStatus === 'paused';
  return {
    stories,
    // Offline, the first fetch is paused rather than failed: show the retry row, not a skeleton forever.
    isLoading: query.isPending && !isPaused,
    isError: query.isError || (query.isPending && isPaused),
    refetch: query.refetch,
    markViewed,
  };
}
