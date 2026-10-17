/** Stories entry point: StoriesService over the Supabase repository (see docs/stories.md). */
import type { Db } from '../lib/db.ts';
import { createLogger, type Logger } from '../lib/logger.ts';
import type { EntitlementService } from '../plans/ports.ts';
import type { StoriesService, StoryFeedRepository, StoryGenerationRepository } from './ports.ts';
import { createSupabaseStoriesRepository } from './repositories/supabase.ts';
import { runStoriesJob } from './services/storiesJob.ts';
import { getStories, markProductUpdatesViewed, markViewed, recordEvents, type StoriesReadDeps } from './services/storiesService.ts';

export interface StoriesDeps {
  repo: StoryFeedRepository & StoryGenerationRepository;
  entitlements: Pick<EntitlementService, 'getEntitlements'>;
  clock: () => Date;
  voiceEnabled?: boolean;
  logger?: Logger;
}

export function createStoriesServiceFromRepository(deps: StoriesDeps): StoriesService {
  const read: StoriesReadDeps = deps;
  const logger = deps.logger ?? createLogger({ module: 'stories' });
  return {
    getStories: (caller, ctx) => getStories(read, caller, ctx),
    markViewed: (caller, storyId, lastCardIndex) => markViewed(read, caller, storyId, lastCardIndex),
    markProductUpdatesViewed: (caller, ids) => markProductUpdatesViewed(read, caller, ids),
    recordEvents: (caller, events) => recordEvents(read, caller, events),
    runJob: (now, options) => runStoriesJob({ repo: deps.repo, logger }, now ?? deps.clock(), options),
  };
}

export function createStoriesService(deps: Omit<StoriesDeps, 'repo'> & { db: Db }): StoriesService {
  return createStoriesServiceFromRepository({ ...deps, repo: createSupabaseStoriesRepository(deps.db) });
}
