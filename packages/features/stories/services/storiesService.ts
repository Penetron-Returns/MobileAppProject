/**
 * Read side of the stories (GET /v1/stories, view state, analytics). Business-scoped: every call carries the
 * caller's business and user, taken from the verified session by the route.
 *
 * Setup flags for product updates come from business data only: `companion` is the plan feature,
 * `act_then_undo` is treated as available whenever `companion` is (the approval policy lives at Nerova and is
 * not read here, see docs/stories.md), and `voice` follows the server's cloud transcription switch.
 */
import type { EntitlementService } from '../../plans/ports.ts';
import { notFound } from '../../lib/errors.ts';
import type { StoriesResponseDTO, StoryDTO, StoryEventDTO, UUID } from '@booking/types';
import type { StoriesCaller, StoriesRequestContext, StoryFeedRepository, StoredStoryEvent } from '../ports.ts';
import { productUpdateCard, selectProductUpdates } from '../aggregators/productUpdates.ts';
import { STORY_TITLES } from '../strings.ts';
import type { StoryKind } from '../types.ts';

const KIND_ORDER: StoryKind[] = ['brief', 'clients', 'business'];
/** A client-reported event time is trusted only within this window around the server clock. */
const EVENT_PAST_MS = 7 * 24 * 3_600_000;
const EVENT_FUTURE_MS = 5 * 60_000;

export interface StoriesReadDeps {
  repo: StoryFeedRepository;
  entitlements: Pick<EntitlementService, 'getEntitlements'>;
  clock: () => Date;
  voiceEnabled?: boolean;
}

export async function getStories(deps: StoriesReadDeps, caller: StoriesCaller, ctx: StoriesRequestContext): Promise<StoriesResponseDTO> {
  const now = deps.clock();
  const nowIso = now.toISOString();
  const [rows, entitlements, updates, seen] = await Promise.all([
    deps.repo.listCurrentStories(caller.businessId, nowIso),
    deps.entitlements.getEntitlements(caller.businessId),
    deps.repo.listApprovedProductUpdates(nowIso),
    deps.repo.listSeenProductUpdateIds(caller.userId),
  ]);
  const views = await deps.repo.listStoryViews(caller.userId, rows.map((r) => r.id));

  // Latest generation per kind wins (a month-end Business update replaces the weekly one generated before it).
  const stories: StoryDTO[] = [];
  for (const kind of KIND_ORDER) {
    const row = rows.filter((r) => r.kind === kind).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
    if (!row || row.cards.length === 0) continue;
    stories.push({
      id: row.id,
      kind,
      title: STORY_TITLES[kind],
      tone: row.tone,
      generatedAt: row.generatedAt,
      viewed: views.has(row.id),
      cards: row.cards,
    });
  }

  const hasCompanion = entitlements.features.some((f) => f.feature === 'companion');
  const setup = new Set<string>();
  if (hasCompanion) {
    setup.add('companion');
    setup.add('act_then_undo');
  }
  if (deps.voiceEnabled) setup.add('voice');
  const cards = selectProductUpdates(updates, {
    plan: entitlements.plan,
    role: caller.role,
    setup,
    platform: ctx.platform,
    appVersion: ctx.appVersion,
    seenIds: seen,
    now,
  }).map(productUpdateCard);

  return { stories, productUpdates: { viewed: false, cards } };
}

export async function markViewed(deps: StoriesReadDeps, caller: StoriesCaller, storyId: UUID, lastCardIndex: number): Promise<void> {
  const found = await deps.repo.markStoryViewed({
    businessId: caller.businessId,
    storyId,
    userId: caller.userId,
    lastCardIndex,
    at: deps.clock().toISOString(),
  });
  if (!found) throw notFound('Story');
}

export async function markProductUpdatesViewed(deps: StoriesReadDeps, caller: StoriesCaller, ids: string[]): Promise<void> {
  await deps.repo.markProductUpdatesViewed({ userId: caller.userId, ids: [...new Set(ids)], at: deps.clock().toISOString() });
}

export async function recordEvents(deps: StoriesReadDeps, caller: StoriesCaller, events: StoryEventDTO[]): Promise<{ stored: number }> {
  const now = deps.clock().getTime();
  const stored: StoredStoryEvent[] = events.map((e) => {
    const claimed = e.at ? Date.parse(e.at) : Number.NaN;
    const trusted = Number.isFinite(claimed) && claimed >= now - EVENT_PAST_MS && claimed <= now + EVENT_FUTURE_MS;
    return { ...e, at: new Date(trusted ? claimed : now).toISOString() };
  });
  if (stored.length > 0) await deps.repo.insertStoryEvents({ businessId: caller.businessId, userId: caller.userId, events: stored });
  return { stored: stored.length };
}
