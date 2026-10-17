/** Contracts of the stories feature: repositories (persistence) and the service the routes and the cron job use. */
import type { StoriesResponseDTO, StoryEventDTO, MemberRole, UUID } from '@booking/types';
import type { AppointmentFact, ClientFact, ProductUpdate, StoryCard, StoryKind, StoryTone } from './types.ts';

export interface StoryRow {
  id: UUID;
  businessId: UUID;
  kind: StoryKind;
  periodKey: string;
  tone: StoryTone;
  cards: StoryCard[];
  /** ISO-8601 UTC */
  generatedAt: string;
  expiresAt: string;
}

export interface StoryBusiness {
  id: UUID;
  timezone: string;
  currency: string;
}

export type StoryUpsert = Omit<StoryRow, 'id'>;

/** What the cron job needs. Every query is scoped by business_id (the client is service-role). */
export interface StoryGenerationRepository {
  /** Businesses ordered by id, strictly after `after` */
  listBusinesses(opts: { after: UUID | null; limit: number }): Promise<StoryBusiness[]>;
  /** Earliest opens_at on `weekday` (0 = Sunday) in minutes after midnight; null when closed */
  firstOpeningMinute(businessId: UUID, weekday: number): Promise<number | null>;
  /** Existing stories of these kinds for these period keys */
  findStories(businessId: UUID, kinds: StoryKind[], periodKeys: string[]): Promise<StoryRow[]>;
  /** Appointments (any status) starting in [fromIso, toIso), joined with client name and service */
  loadAppointments(businessId: UUID, fromIso: string, toIso: string): Promise<AppointmentFact[]>;
  loadClientsCreatedSince(businessId: UUID, sinceIso: string): Promise<ClientFact[]>;
  /** Insert or update by (business, kind, period); returns nothing, the id is stable across upserts */
  upsertStory(story: StoryUpsert): Promise<void>;
  deleteStory(businessId: UUID, storyId: UUID): Promise<void>;
}

/** What the routes need. */
export interface StoryFeedRepository {
  /** Stories of the business that have not expired, newest first */
  listCurrentStories(businessId: UUID, nowIso: string): Promise<StoryRow[]>;
  /** Furthest card per story for this user */
  listStoryViews(userId: string, storyIds: UUID[]): Promise<Map<UUID, number>>;
  /** Approved product updates released at or before `nowIso` */
  listApprovedProductUpdates(nowIso: string): Promise<ProductUpdate[]>;
  listSeenProductUpdateIds(userId: string): Promise<Set<string>>;
  /** False when the story does not belong to the business. Keeps the furthest card reached. */
  markStoryViewed(input: { businessId: UUID; storyId: UUID; userId: string; lastCardIndex: number; at: string }): Promise<boolean>;
  /** Ids that are not product updates are ignored; repeats are harmless */
  markProductUpdatesViewed(input: { userId: string; ids: string[]; at: string }): Promise<void>;
  /** A story id that is not the business's is stored as null */
  insertStoryEvents(input: { businessId: UUID; userId: string; events: StoredStoryEvent[] }): Promise<void>;
}

export interface StoredStoryEvent extends Omit<StoryEventDTO, 'at'> {
  at: string;
}

export interface StoriesCaller {
  businessId: UUID;
  userId: string;
  role: MemberRole;
}

export interface StoriesRequestContext {
  /** From the X-Platform header: ios, android, web or unknown */
  platform: string;
  /** From the X-App-Version header */
  appVersion: string | null;
}

export interface StoriesService {
  getStories(caller: StoriesCaller, ctx: StoriesRequestContext): Promise<StoriesResponseDTO>;
  markViewed(caller: StoriesCaller, storyId: UUID, lastCardIndex: number): Promise<void>;
  markProductUpdatesViewed(caller: StoriesCaller, ids: string[]): Promise<void>;
  recordEvents(caller: StoriesCaller, events: StoryEventDTO[]): Promise<{ stored: number }>;
  /** The /cron/stories job: counts only */
  runJob(now?: Date): Promise<Record<string, number>>;
}
