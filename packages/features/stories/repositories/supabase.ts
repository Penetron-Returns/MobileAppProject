/**
 * Supabase implementation of the stories repositories. The service-role client bypasses RLS, so every query is
 * scoped by business_id; the only global reads are the business list for the cron job and the global
 * product-update catalogue (and the caller's own view rows, scoped by user id).
 */
import type { Database, Json } from '@booking/database';
import type { UUID } from '@booking/types';
import type { Db } from '../../lib/db.ts';
import { parseTimeOfDay, toIsoInstant } from '../../lib/time.ts';
import { check, rows } from '../../repositories/dbResult.ts';
import type {
  StoredStoryEvent,
  StoryBusiness,
  StoryFeedRepository,
  StoryGenerationRepository,
  StoryRow,
  StoryUpsert,
} from '../ports.ts';
import type { AppointmentFact, ClientFact, ProductUpdate, ProductUpdateTags, StoryCard, StoryKind, StoryTone } from '../types.ts';

const PAGE = 1000;
const ID_SLICE = 100;
const MAX_PAGES = 20;

type StoryDbRow = Database['public']['Tables']['stories']['Row'];
type ProductUpdateDbRow = Database['public']['Tables']['product_updates']['Row'];

const toStoryRow = (r: StoryDbRow): StoryRow => ({
  id: r.id,
  businessId: r.business_id,
  kind: r.kind as StoryKind,
  periodKey: r.period_key,
  tone: r.tone as StoryTone,
  cards: r.cards as unknown as StoryCard[],
  generatedAt: toIsoInstant(r.generated_at),
  expiresAt: toIsoInstant(r.expires_at),
});

const stringList = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;

/** The tags column is free-form jsonb: keep only the fields and types the selector understands. */
export function parseTags(value: Json): ProductUpdateTags {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const tags: ProductUpdateTags = {};
  for (const key of ['plans', 'roles', 'requires', 'platforms'] as const) {
    const list = stringList(raw[key]);
    if (list) tags[key] = list;
  }
  if (typeof raw.minAppVersion === 'string') tags.minAppVersion = raw.minAppVersion;
  return tags;
}

function parseAction(value: Json | null): ProductUpdate['action'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { label, deeplink } = value as Record<string, unknown>;
  return typeof label === 'string' && typeof deeplink === 'string' ? { label, deeplink } : null;
}

const toProductUpdate = (r: ProductUpdateDbRow): ProductUpdate => ({
  id: r.id,
  releasedAt: toIsoInstant(r.released_at),
  title: r.title,
  body: r.body,
  tone: r.tone as StoryTone,
  tags: parseTags(r.tags),
  demo: r.demo,
  status: r.status === 'approved' ? 'approved' : 'draft',
  action: parseAction(r.action),
});

export function createSupabaseStoriesRepository(db: Db): StoryGenerationRepository & StoryFeedRepository {
  /** Reads an id list in slices: PostgREST puts `in` filters in the URL. */
  async function namesById(table: 'clients' | 'services', businessId: UUID, ids: string[]): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    for (let i = 0; i < ids.length; i += ID_SLICE) {
      const found = rows<{ id: string; name: string | null }>(
        await db.from(table).select('id, name').eq('business_id', businessId).in('id', ids.slice(i, i + ID_SLICE)),
      );
      for (const r of found) out.set(r.id, r.name);
    }
    return out;
  }

  async function ownedStoryIds(businessId: UUID, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const found = rows<{ id: string }>(await db.from('stories').select('id').eq('business_id', businessId).in('id', ids));
    return new Set(found.map((r) => r.id));
  }

  return {
    async listBusinesses({ after, limit }) {
      let query = db.from('businesses').select('id, timezone, currency').order('id').limit(limit);
      if (after) query = query.gt('id', after);
      return rows<StoryBusiness>(await query);
    },

    async firstOpeningMinute(businessId, weekday) {
      const found = rows<{ opens_at: string }>(
        await db.from('business_hours').select('opens_at').eq('business_id', businessId).eq('weekday', weekday).order('opens_at').limit(1),
      );
      return found[0] ? parseTimeOfDay(found[0].opens_at) : null;
    },

    async findStories(businessId, kinds, periodKeys) {
      return rows<StoryDbRow>(
        await db.from('stories').select('*').eq('business_id', businessId).in('kind', kinds).in('period_key', periodKeys),
      ).map(toStoryRow);
    },

    async loadAppointments(businessId, fromIso, toIso) {
      const found: Database['public']['Tables']['appointments']['Row'][] = [];
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const batch = rows<Database['public']['Tables']['appointments']['Row']>(
          await db
            .from('appointments')
            .select('id, starts_at, created_at, status, client_id, service_id, price_cents, client_confirmed_at')
            .eq('business_id', businessId)
            .gte('starts_at', fromIso)
            .lt('starts_at', toIso)
            .order('starts_at')
            .order('id')
            .range(page * PAGE, (page + 1) * PAGE - 1),
        );
        found.push(...batch);
        if (batch.length < PAGE) break;
      }
      const [clients, services] = await Promise.all([
        namesById('clients', businessId, [...new Set(found.map((a) => a.client_id))]),
        namesById('services', businessId, [...new Set(found.map((a) => a.service_id))]),
      ]);
      return found.map(
        (a): AppointmentFact => ({
          id: a.id,
          startsAt: toIsoInstant(a.starts_at),
          createdAt: toIsoInstant(a.created_at),
          status: a.status,
          clientId: a.client_id,
          clientName: clients.get(a.client_id) ?? null,
          serviceId: a.service_id,
          serviceName: services.get(a.service_id) ?? 'Service',
          priceCents: a.price_cents,
          clientConfirmedAt: a.client_confirmed_at ? toIsoInstant(a.client_confirmed_at) : null,
        }),
      );
    },

    async loadClientsCreatedSince(businessId, sinceIso) {
      return rows<{ id: string; name: string | null; created_at: string }>(
        await db.from('clients').select('id, name, created_at').eq('business_id', businessId).gt('created_at', sinceIso).order('created_at').limit(PAGE),
      ).map((c): ClientFact => ({ id: c.id, name: c.name, createdAt: toIsoInstant(c.created_at) }));
    },

    async upsertStory(story: StoryUpsert) {
      check(
        await db.from('stories').upsert(
          {
            business_id: story.businessId,
            kind: story.kind,
            period_key: story.periodKey,
            tone: story.tone,
            cards: story.cards as unknown as Json,
            generated_at: story.generatedAt,
            expires_at: story.expiresAt,
          },
          { onConflict: 'business_id,kind,period_key' },
        ),
      );
    },

    async deleteStory(businessId, storyId) {
      check(await db.from('stories').delete().eq('business_id', businessId).eq('id', storyId));
    },

    async listCurrentStories(businessId, nowIso) {
      return rows<StoryDbRow>(
        await db.from('stories').select('*').eq('business_id', businessId).gt('expires_at', nowIso).order('generated_at', { ascending: false }),
      ).map(toStoryRow);
    },

    async listStoryViews(userId, storyIds) {
      const out = new Map<UUID, number>();
      if (storyIds.length === 0) return out;
      for (const v of rows<{ story_id: string; last_card_index: number }>(
        await db.from('story_views').select('story_id, last_card_index').eq('user_id', userId).in('story_id', storyIds),
      )) {
        out.set(v.story_id, v.last_card_index);
      }
      return out;
    },

    async listApprovedProductUpdates(nowIso) {
      return rows<ProductUpdateDbRow>(
        await db.from('product_updates').select('*').eq('status', 'approved').lte('released_at', nowIso).order('released_at', { ascending: false }).limit(50),
      ).map(toProductUpdate);
    },

    async listSeenProductUpdateIds(userId) {
      return new Set(rows<{ update_id: string }>(await db.from('product_update_views').select('update_id').eq('user_id', userId)).map((r) => r.update_id));
    },

    async markStoryViewed({ businessId, storyId, userId, lastCardIndex, at }) {
      if (!(await ownedStoryIds(businessId, [storyId])).has(storyId)) return false;
      const existing = rows<{ last_card_index: number }>(
        await db.from('story_views').select('last_card_index').eq('story_id', storyId).eq('user_id', userId),
      )[0];
      check(
        await db.from('story_views').upsert(
          { story_id: storyId, user_id: userId, viewed_at: at, last_card_index: Math.max(lastCardIndex, existing?.last_card_index ?? 0) },
          { onConflict: 'story_id,user_id' },
        ),
      );
      return true;
    },

    async markProductUpdatesViewed({ userId, ids, at }) {
      if (ids.length === 0) return;
      const known = rows<{ id: string }>(await db.from('product_updates').select('id').in('id', ids)).map((r) => r.id);
      if (known.length === 0) return;
      check(
        await db.from('product_update_views').upsert(
          known.map((update_id) => ({ update_id, user_id: userId, viewed_at: at })),
          { onConflict: 'update_id,user_id', ignoreDuplicates: true },
        ),
      );
    },

    async insertStoryEvents({ businessId, userId, events }: { businessId: UUID; userId: string; events: StoredStoryEvent[] }) {
      const owned = await ownedStoryIds(businessId, [...new Set(events.flatMap((e) => (e.storyId ? [e.storyId] : [])))]);
      check(
        await db.from('story_events').insert(
          events.map((e) => ({
            business_id: businessId,
            user_id: userId,
            story_kind: e.storyKind,
            story_id: e.storyId && owned.has(e.storyId) ? e.storyId : null,
            card_index: e.cardIndex,
            event: e.event,
            at: e.at,
          })),
        ),
      );
    },
  };
}
