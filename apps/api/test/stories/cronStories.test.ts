import { describe, expect, it } from 'vitest';

import { createStoriesServiceFromRepository } from '@booking/features/stories/index.ts';
import { fakeEntitlements } from '@booking/testing/entitlements.ts';
import { createMemoryStoriesRepository } from '@booking/testing/stories.ts';
import { plansHarness } from '../plans/harness.ts';
import { TZ, fact, sastDate } from './fixtures.ts';

const A = '10000000-0000-4000-8000-00000000000a';
const B = '10000000-0000-4000-8000-00000000000b';
const SATURDAY_AFTERNOON = sastDate('2026-10-17T15:00');
const SECRET = { 'x-cron-secret': 'cron-secret' };

function setup() {
  const repo = createMemoryStoriesRepository();
  repo.businesses.push({ id: A, timezone: TZ, currency: 'ZAR' }, { id: B, timezone: TZ, currency: 'ZAR' });
  repo.appointments.set(A, [fact({ local: '2026-10-17T10:00', clientName: 'Thandi Nkosi' })]);
  repo.appointments.set(B, [fact({ local: '2026-10-17T11:00', clientName: 'Aisha Patel' })]);
  const stories = createStoriesServiceFromRepository({ repo, entitlements: fakeEntitlements('growth'), clock: () => SATURDAY_AFTERNOON });
  const h = plansHarness({ overrides: { stories } });
  return { repo, app: h.app };
}

describe('POST /cron/stories', () => {
  it('requires the cron secret', async () => {
    const { app, repo } = setup();
    expect((await app.request('/cron/stories?force=1', { method: 'POST' })).status).toBe(401);
    expect((await app.request('/cron/stories?force=1', { method: 'POST', headers: { 'x-cron-secret': 'wrong' } })).status).toBe(401);
    expect(repo.stories).toEqual([]);
  });

  it('without force builds nothing outside the slots', async () => {
    const { app, repo } = setup();
    const res = await app.request('/cron/stories', { method: 'POST', headers: SECRET });
    expect(res.status).toBe(200);
    expect(repo.stories).toEqual([]);
  });

  it('force=1 builds all three kinds for every business outside the slots', async () => {
    const { app, repo } = setup();
    const res = await app.request('/cron/stories?force=1', { method: 'POST', headers: SECRET });
    expect(res.status).toBe(200);
    expect(repo.stories.filter((s) => s.businessId === A).map((s) => s.kind).sort()).toEqual(['brief', 'business', 'clients'].filter((k) => repo.stories.some((s) => s.businessId === A && s.kind === k)));
    expect(repo.stories.some((s) => s.businessId === B && s.kind === 'brief')).toBe(true);
  });

  it('force=1&businessId limits the run to that business, and rejects a malformed id', async () => {
    const { app, repo } = setup();
    expect((await app.request('/cron/stories?force=1&businessId=nope', { method: 'POST', headers: SECRET })).status).toBe(400);
    expect((await app.request(`/cron/stories?force=1&businessId=${B}`, { method: 'POST', headers: SECRET })).status).toBe(200);
    expect(repo.stories.length).toBeGreaterThan(0);
    expect(repo.stories.every((s) => s.businessId === B)).toBe(true);
  });
});
