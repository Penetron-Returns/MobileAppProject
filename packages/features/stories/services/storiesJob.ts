/**
 * /cron/stories (every 15 minutes): per business, builds the stories that are due (see lib/schedule.ts) and
 * refreshes today's Brief and this week's Client updates when they are stale and their content changed.
 * Idempotent: the unique key (business, kind, period) makes a repeat run an update of the same row, and an
 * unchanged story is not written at all. Businesses run BUSINESS_CONCURRENCY at a time; logs carry counts only.
 */
import { DateTime } from 'luxon';

import type { Logger } from '../../lib/logger.ts';
import { weekdayOf } from '../../lib/time.ts';
import type { StoryBusiness, StoryGenerationRepository, StoryRow } from '../ports.ts';
import { buildBrief } from '../aggregators/brief.ts';
import { buildBusinessStory, businessWindows } from '../aggregators/business.ts';
import { buildClientsStory } from '../aggregators/clients.ts';
import { DAY_MS, WEEK_MS } from '../lib/format.ts';
import { briefKey, expiresAtFor, monthKey, planForcedStories, planStories, weekKey, type StoryTask } from '../lib/schedule.ts';
import type { GeneratedStory, StoryKind } from '../types.ts';

export const BUSINESS_CONCURRENCY = 5;
const BUSINESS_PAGE = 200;
/** How far back client history is read: covers the 6-week lapsed rule evaluated at the 30-day comparison point. */
const HISTORY_DAYS = 365;

export interface StoriesJobDeps {
  repo: StoryGenerationRepository;
  logger: Logger;
}

/** `force` builds all three kinds now, outside their slots (testing and demos); `businessId` limits the run to one business. */
export interface StoriesJobOptions {
  force?: boolean;
  businessId?: string;
}

export interface StoriesJobCounts extends Record<string, number> {
  businesses: number;
  created: number;
  refreshed: number;
  unchanged: number;
  removed: number;
  errors: number;
}

const iso = (ms: number) => new Date(ms).toISOString();

async function generate(repo: StoryGenerationRepository, b: StoryBusiness, task: StoryTask, now: Date): Promise<GeneratedStory | null> {
  const common = { now, timezone: b.timezone, currency: b.currency };
  if (task.kind === 'brief') {
    const day = DateTime.fromMillis(now.getTime(), { zone: b.timezone }).startOf('day');
    const appointments = await repo.loadAppointments(b.id, day.toISO()!, day.plus({ days: 1 }).toISO()!);
    return buildBrief({ ...common, appointments });
  }
  if (task.kind === 'clients') {
    const to = now.getTime();
    const from = to - HISTORY_DAYS * DAY_MS;
    const [clients, appointments] = await Promise.all([
      repo.loadClientsCreatedSince(b.id, iso(to - WEEK_MS)),
      repo.loadAppointments(b.id, iso(from), iso(to + HISTORY_DAYS * DAY_MS)),
    ]);
    return buildClientsStory({ now, timezone: b.timezone, clients, appointments });
  }
  const span = task.span ?? 'week';
  const { previous } = businessWindows(now, b.timezone, span);
  const appointments = await repo.loadAppointments(b.id, iso(previous.from + 1), iso(now.getTime() + 1));
  return buildBusinessStory({ ...common, span, appointments });
}

const sameContent = (row: StoryRow, story: GeneratedStory) =>
  row.tone === story.tone && JSON.stringify(row.cards) === JSON.stringify(story.cards);

async function processBusiness(deps: StoriesJobDeps, b: StoryBusiness, now: Date, counts: StoriesJobCounts, force: boolean): Promise<void> {
  const { repo } = deps;
  const local = DateTime.fromMillis(now.getTime(), { zone: b.timezone });
  const keys = [briefKey(local), weekKey(local), monthKey(local)];
  const existing = await repo.findStories(b.id, ['brief', 'clients', 'business'], keys);
  const firstOpenMinute = await repo.firstOpeningMinute(b.id, weekdayOf(local.toISODate()!));
  const tasks = force ? planForcedStories(now, b.timezone) : planStories({
    now,
    timezone: b.timezone,
    firstOpenMinute,
    existing: existing.map((r) => ({ kind: r.kind, periodKey: r.periodKey, generatedAt: r.generatedAt })),
  });

  for (const task of tasks) {
    const story = await generate(repo, b, task, now);
    const row = existing.find((r) => r.kind === task.kind && r.periodKey === task.periodKey);
    if (!story) {
      if (row) {
        await repo.deleteStory(b.id, row.id);
        counts.removed += 1;
      }
      continue;
    }
    if (row && sameContent(row, story)) {
      counts.unchanged += 1;
      continue;
    }
    await repo.upsertStory({
      businessId: b.id,
      kind: task.kind as StoryKind,
      periodKey: task.periodKey,
      tone: story.tone,
      cards: story.cards,
      generatedAt: now.toISOString(),
      expiresAt: expiresAtFor(task.kind, now, b.timezone).toISOString(),
    });
    counts[task.reason === 'refresh' ? 'refreshed' : 'created'] += 1;
  }
}

export async function runStoriesJob(deps: StoriesJobDeps, now: Date, options: StoriesJobOptions = {}): Promise<StoriesJobCounts> {
  const counts: StoriesJobCounts = { businesses: 0, created: 0, refreshed: 0, unchanged: 0, removed: 0, errors: 0 };
  let after: string | null = null;
  for (;;) {
    const listed = await deps.repo.listBusinesses({ after, limit: BUSINESS_PAGE });
    const page = options.businessId ? listed.filter((b) => b.id === options.businessId) : listed;
    for (let i = 0; i < page.length; i += BUSINESS_CONCURRENCY) {
      const batch = page.slice(i, i + BUSINESS_CONCURRENCY);
      const results = await Promise.allSettled(batch.map((b) => processBusiness(deps, b, now, counts, options.force === true)));
      results.forEach((r, j) => {
        counts.businesses += 1;
        if (r.status === 'rejected') {
          counts.errors += 1;
          deps.logger.warn('stories_business_failed', { business_id: batch[j]!.id, error: r.reason instanceof Error ? r.reason.name : 'unknown' });
        }
      });
    }
    if (listed.length < BUSINESS_PAGE) break;
    after = listed[listed.length - 1]!.id;
  }
  return counts;
}
