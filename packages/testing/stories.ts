/** In-memory stories repositories: same contract as the Supabase one (scoping, upsert key, furthest-card view). */
import type { StoriesCaller, StoredStoryEvent, StoryBusiness, StoryFeedRepository, StoryGenerationRepository, StoryRow } from '@booking/features/stories/ports.ts';
import type { AppointmentFact, ClientFact, ProductUpdate } from '@booking/features/stories/types.ts';

export interface MemoryStoriesRepository extends StoryGenerationRepository, StoryFeedRepository {
  businesses: StoryBusiness[];
  /** businessId -> weekday -> earliest opening minute */
  hours: Map<string, Map<number, number>>;
  stories: StoryRow[];
  /** appointments keyed by business */
  appointments: Map<string, AppointmentFact[]>;
  clients: Map<string, ClientFact[]>;
  productUpdates: ProductUpdate[];
  storyViews: { storyId: string; userId: string; lastCardIndex: number }[];
  productViews: { updateId: string; userId: string }[];
  events: { businessId: string; userId: string; storyId: string | null; storyKind: string; cardIndex: number; event: string; at: string }[];
  /** Business ids whose reads throw (job isolation tests) */
  failing: Set<string>;
  upserts: number;
}

export function createMemoryStoriesRepository(): MemoryStoriesRepository {
  let seq = 0;
  const repo: MemoryStoriesRepository = {
    businesses: [],
    hours: new Map(),
    stories: [],
    appointments: new Map(),
    clients: new Map(),
    productUpdates: [],
    storyViews: [],
    productViews: [],
    events: [],
    failing: new Set(),
    upserts: 0,

    async listBusinesses({ after, limit }) {
      return repo.businesses.filter((b) => !after || b.id > after).sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit);
    },
    async firstOpeningMinute(businessId, weekday) {
      if (repo.failing.has(businessId)) throw new Error('boom');
      return repo.hours.get(businessId)?.get(weekday) ?? null;
    },
    async findStories(businessId, kinds, periodKeys) {
      return repo.stories.filter((s) => s.businessId === businessId && kinds.includes(s.kind) && periodKeys.includes(s.periodKey));
    },
    async loadAppointments(businessId, fromIso, toIso) {
      return (repo.appointments.get(businessId) ?? []).filter((a) => a.startsAt >= fromIso && a.startsAt < toIso);
    },
    async loadClientsCreatedSince(businessId, sinceIso) {
      return (repo.clients.get(businessId) ?? []).filter((c) => c.createdAt > sinceIso);
    },
    async upsertStory(story) {
      repo.upserts += 1;
      const at = repo.stories.findIndex((s) => s.businessId === story.businessId && s.kind === story.kind && s.periodKey === story.periodKey);
      if (at >= 0) repo.stories[at] = { ...story, id: repo.stories[at]!.id };
      else {
        seq += 1;
        repo.stories.push({ ...story, id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}` });
      }
    },
    async deleteStory(businessId, storyId) {
      repo.stories = repo.stories.filter((s) => !(s.businessId === businessId && s.id === storyId));
    },

    async listCurrentStories(businessId, nowIso) {
      return repo.stories.filter((s) => s.businessId === businessId && s.expiresAt > nowIso).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    },
    async listStoryViews(userId, storyIds) {
      return new Map(repo.storyViews.filter((v) => v.userId === userId && storyIds.includes(v.storyId)).map((v) => [v.storyId, v.lastCardIndex]));
    },
    async listApprovedProductUpdates(nowIso) {
      return repo.productUpdates.filter((u) => u.status === 'approved' && u.releasedAt <= nowIso);
    },
    async listSeenProductUpdateIds(userId) {
      return new Set(repo.productViews.filter((v) => v.userId === userId).map((v) => v.updateId));
    },
    async markStoryViewed({ businessId, storyId, userId, lastCardIndex }) {
      if (!repo.stories.some((s) => s.id === storyId && s.businessId === businessId)) return false;
      const existing = repo.storyViews.find((v) => v.storyId === storyId && v.userId === userId);
      if (existing) existing.lastCardIndex = Math.max(existing.lastCardIndex, lastCardIndex);
      else repo.storyViews.push({ storyId, userId, lastCardIndex });
      return true;
    },
    async markProductUpdatesViewed({ userId, ids }) {
      for (const id of ids) {
        if (repo.productUpdates.some((u) => u.id === id) && !repo.productViews.some((v) => v.updateId === id && v.userId === userId)) {
          repo.productViews.push({ updateId: id, userId });
        }
      }
    },
    async insertStoryEvents({ businessId, userId, events }: { businessId: string; userId: string; events: StoredStoryEvent[] }) {
      for (const e of events) {
        const owned = e.storyId ? repo.stories.some((s) => s.id === e.storyId && s.businessId === businessId) : false;
        repo.events.push({ businessId, userId, storyId: owned ? (e.storyId ?? null) : null, storyKind: e.storyKind, cardIndex: e.cardIndex, event: e.event, at: e.at });
      }
    },
  };
  return repo;
}

export type { StoriesCaller };
