import { describe, expect, it } from 'vitest';

import { createStoriesServiceFromRepository } from '@booking/features/stories/index.ts';
import { BUSINESS_CONCURRENCY, runStoriesJob } from '@booking/features/stories/services/storiesJob.ts';
import type { Logger } from '@booking/features/lib/logger.ts';
import { fakeEntitlements } from '@booking/testing/entitlements.ts';
import { createMemoryStoriesRepository, type MemoryStoriesRepository } from '@booking/testing/stories.ts';
import { TZ, client, daysAgo, fact, sastDate } from './fixtures.ts';

const A = '10000000-0000-4000-8000-00000000000a';
const B = '10000000-0000-4000-8000-00000000000b';
const SATURDAY = 6;
const MONDAY = 1;
const logged: { msg: string; fields?: Record<string, unknown> }[] = [];
const quiet: Logger = {
  debug: () => {},
  info: (msg, fields) => void logged.push({ msg, fields }),
  warn: (msg, fields) => void logged.push({ msg, fields }),
  error: (msg, fields) => void logged.push({ msg, fields }),
  child: () => quiet,
};

function world(): MemoryStoriesRepository {
  const repo = createMemoryStoriesRepository();
  repo.businesses.push({ id: A, timezone: TZ, currency: 'ZAR' }, { id: B, timezone: TZ, currency: 'ZAR' });
  for (const id of [A, B]) repo.hours.set(id, new Map([[SATURDAY, 9 * 60], [MONDAY, 9 * 60]]));
  repo.appointments.set(A, [fact({ local: '2026-10-17T10:00', clientName: 'Thandi Nkosi' }), fact({ local: '2026-10-17T11:00', clientName: 'Aisha Patel' })]);
  repo.appointments.set(B, [fact({ local: '2026-10-17T12:00', clientName: 'Someone Else' })]);
  return repo;
}
const run = (repo: MemoryStoriesRepository, local: string) => runStoriesJob({ repo, logger: quiet }, sastDate(local));
const briefOf = (repo: MemoryStoriesRepository, businessId: string) => repo.stories.find((s) => s.businessId === businessId && s.kind === 'brief');

describe('stories cron job', () => {
  it('creates today’s Brief per business in the 30 minutes before opening, scoped to each business', async () => {
    const repo = world();
    const counts = await run(repo, '2026-10-17T08:45');
    expect(counts).toMatchObject({ businesses: 2, created: 2, errors: 0 });
    expect(briefOf(repo, A)?.cards[0]?.headline).toBe('2 bookings today');
    expect(briefOf(repo, B)?.cards[0]?.headline).toBe('1 booking today');
    expect(briefOf(repo, B)?.cards.flatMap((c) => c.list ?? []).map((l) => l.name)).toEqual(['Someone']);
    expect(briefOf(repo, A)).toMatchObject({ periodKey: '2026-10-17', expiresAt: sastDate('2026-10-18T00:00').toISOString(), generatedAt: sastDate('2026-10-17T08:45').toISOString() });
  });

  it('skips a business after its opening time, and one that is closed today', async () => {
    const repo = world();
    repo.hours.set(B, new Map());
    expect(await run(repo, '2026-10-17T08:45')).toMatchObject({ created: 1 });
    expect(briefOf(repo, B)).toBeUndefined();
    const late = world();
    expect(await run(late, '2026-10-17T09:15')).toMatchObject({ created: 0 });
    expect(late.stories).toEqual([]);
  });

  it('is idempotent: a second tick inside the window writes nothing and keeps one row per period', async () => {
    const repo = world();
    await run(repo, '2026-10-17T08:30');
    const upserts = repo.upserts;
    expect(await run(repo, '2026-10-17T08:45')).toMatchObject({ created: 0, refreshed: 0 });
    expect(repo.upserts).toBe(upserts);
    expect(repo.stories.filter((s) => s.kind === 'brief')).toHaveLength(2);
  });

  it('writes no story when there is nothing to say', async () => {
    const repo = world();
    repo.appointments.set(A, []);
    await run(repo, '2026-10-17T08:45');
    expect(briefOf(repo, A)).toBeUndefined();
  });

  describe('refreshing today’s Brief', () => {
    it('regenerates a stale Brief when something changed, keeping the story id', async () => {
      const repo = world();
      await run(repo, '2026-10-17T08:30');
      const id = briefOf(repo, A)!.id;
      repo.appointments.get(A)!.push(fact({ local: '2026-10-17T14:00', clientName: 'Lerato Dube' }));
      expect(await run(repo, '2026-10-17T10:00')).toMatchObject({ refreshed: 1, unchanged: 1 });
      expect(briefOf(repo, A)).toMatchObject({ id });
      expect(briefOf(repo, A)?.cards[0]?.headline).toBe('3 bookings today');
      expect(briefOf(repo, A)?.generatedAt).toBe(sastDate('2026-10-17T10:00').toISOString());
    });

    it('leaves a fresh Brief alone and does not rewrite an unchanged one', async () => {
      const repo = world();
      await run(repo, '2026-10-17T08:30');
      repo.appointments.get(A)!.push(fact({ local: '2026-10-17T14:00' }));
      expect(await run(repo, '2026-10-17T08:44')).toMatchObject({ refreshed: 0, unchanged: 0 });
      const upserts = repo.upserts;
      expect(await run(repo, '2026-10-17T11:00')).toMatchObject({ refreshed: 1, unchanged: 1 });
      expect(await run(repo, '2026-10-17T11:20')).toMatchObject({ refreshed: 0, unchanged: 2 });
      expect(repo.upserts).toBe(upserts + 1);
    });

    it('removes the story when nothing is left to say', async () => {
      const repo = world();
      await run(repo, '2026-10-17T08:30');
      repo.appointments.set(B, repo.appointments.get(B)!.map((a) => ({ ...a, status: 'cancelled' as const })));
      expect(await run(repo, '2026-10-17T10:00')).toMatchObject({ removed: 1 });
      expect(briefOf(repo, B)).toBeUndefined();
      expect(briefOf(repo, A)).toBeDefined();
    });

    it('does not create a Brief outside the window even when bookings exist', async () => {
      const repo = world();
      expect(await run(repo, '2026-10-17T10:00')).toMatchObject({ created: 0, refreshed: 0 });
    });
  });

  describe('Mondays and month-end', () => {
    it('Monday builds Client updates and the weekly Business update from the previous week', async () => {
      const repo = world();
      const monday = sastDate('2026-10-19T00:15');
      repo.clients.set(A, [client('Newbie One', daysAgo(2, monday))]);
      repo.appointments.set(A, [fact({ startsAt: daysAgo(3, monday), priceCents: 40000, status: 'completed' }), fact({ startsAt: daysAgo(4, monday), status: 'no_show', clientName: 'Sipho Zulu' })]);
      await run(repo, '2026-10-19T00:15');
      const clientsStory = repo.stories.find((s) => s.businessId === A && s.kind === 'clients');
      const businessStory = repo.stories.find((s) => s.businessId === A && s.kind === 'business');
      expect(clientsStory).toMatchObject({ periodKey: '2026-W43' });
      expect(clientsStory?.cards[0]?.headline).toBe('1 new client');
      expect(businessStory).toMatchObject({ periodKey: '2026-W43', tone: 'concern' });
      // business B's Business update only sees B's own booking
      expect(repo.stories.find((s) => s.businessId === B && s.kind === 'business')?.cards[0]?.headline).toBe('R250 booked this week');
    });

    it('the last day of the month stores a month-keyed Business update', async () => {
      const repo = world();
      repo.appointments.set(A, [fact({ local: '2026-10-12T10:00', priceCents: 10000, status: 'completed' })]);
      await run(repo, '2026-10-31T12:00');
      expect(repo.stories.find((s) => s.kind === 'business')).toMatchObject({ businessId: A, periodKey: '2026-10' });
    });

    it('a mid-week Tuesday creates neither', async () => {
      const repo = world();
      await run(repo, '2026-10-20T12:00');
      expect(repo.stories).toEqual([]);
    });
  });

  describe('batching and isolation', () => {
    it('processes businesses at most 5 at a time and visits all of them', async () => {
      const repo = createMemoryStoriesRepository();
      const ids = Array.from({ length: 13 }, (_, i) => `20000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
      for (const id of ids) {
        repo.businesses.push({ id, timezone: TZ, currency: 'ZAR' });
        repo.hours.set(id, new Map([[SATURDAY, 9 * 60]]));
      }
      let inFlight = 0;
      let peak = 0;
      const original = repo.firstOpeningMinute;
      repo.firstOpeningMinute = async (...args) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        try {
          return await original(...args);
        } finally {
          inFlight -= 1;
        }
      };
      expect(await run(repo, '2026-10-17T08:45')).toMatchObject({ businesses: 13, errors: 0 });
      expect(peak).toBe(BUSINESS_CONCURRENCY);
    });

    it('one failing business is counted and does not stop the others', async () => {
      const repo = world();
      repo.failing.add(A);
      const counts = await run(repo, '2026-10-17T08:45');
      expect(counts).toMatchObject({ businesses: 2, errors: 1, created: 1 });
      expect(briefOf(repo, B)).toBeDefined();
      // the failure is logged by id and error name only
      expect(logged.at(-1)).toEqual({ msg: 'stories_business_failed', fields: { business_id: A, error: 'Error' } });
    });
  });

  it('is reachable through the service as runJob(now)', async () => {
    const repo = world();
    const service = createStoriesServiceFromRepository({ repo, entitlements: fakeEntitlements('growth'), clock: () => sastDate('2026-10-17T08:45'), logger: quiet });
    expect(await service.runJob()).toMatchObject({ created: 2 });
  });
});
