import { describe, expect, it } from 'vitest';

import { createStoriesServiceFromRepository } from '@booking/features/stories/index.ts';
import type { StoryRow } from '@booking/features/stories/ports.ts';
import type { ProductUpdate, StoryCard } from '@booking/features/stories/types.ts';
import { fakeEntitlements } from '@booking/testing/entitlements.ts';
import { createMemoryStoriesRepository } from '@booking/testing/stories.ts';
import type { PlanKey } from '@booking/types';
import { BIZ, NOW, OWNER_ID, plansHarness } from '../plans/harness.ts';

const OTHER_BIZ = '10000000-0000-4000-8000-0000000000bb';
const BRIEF = '30000000-0000-4000-8000-000000000001';
const CLIENTS = '30000000-0000-4000-8000-000000000002';
const BUSINESS = '30000000-0000-4000-8000-000000000003';
const FOREIGN = '30000000-0000-4000-8000-000000000009';
const EXPIRED = '30000000-0000-4000-8000-000000000008';

const card = (id: string): StoryCard => ({ id, tone: 'neutral', kicker: 'k', headline: `h ${id}`, emotion: 'curious' });
const row = (id: string, kind: StoryRow['kind'], over: Partial<StoryRow> = {}): StoryRow => ({
  id,
  businessId: BIZ,
  kind,
  periodKey: `p-${id.slice(-1)}`,
  tone: 'neutral',
  cards: [card(`${kind}-1`)],
  generatedAt: new Date(NOW.getTime() - 3_600_000).toISOString(),
  expiresAt: new Date(NOW.getTime() + 3_600_000).toISOString(),
  ...over,
});
const product = (id: string, over: Partial<ProductUpdate> = {}): ProductUpdate => ({
  id,
  releasedAt: '2026-10-01T00:00:00.000Z',
  title: `Title ${id}`,
  body: `Body ${id}`,
  tone: 'neutral',
  tags: {},
  demo: null,
  status: 'approved',
  action: null,
  ...over,
});

function setup(opts: { plan?: PlanKey; updates?: ProductUpdate[]; stories?: StoryRow[] } = {}) {
  const plan = opts.plan ?? 'growth';
  const repo = createMemoryStoriesRepository();
  repo.stories.push(
    ...(opts.stories ?? [row(BUSINESS, 'business'), row(BRIEF, 'brief'), row(CLIENTS, 'clients')]),
    row(FOREIGN, 'brief', { businessId: OTHER_BIZ }),
    row(EXPIRED, 'clients', { expiresAt: new Date(NOW.getTime() - 1).toISOString() }),
  );
  repo.productUpdates.push(...(opts.updates ?? []));
  const stories = createStoriesServiceFromRepository({ repo, entitlements: fakeEntitlements(plan), clock: () => NOW });
  const h = plansHarness({ plan, overrides: { stories } });
  let n = 0;
  async function req(method: string, path: string, o: { token?: string; body?: unknown; headers?: Record<string, string>; key?: string | null } = {}) {
    n += 1;
    const headers: Record<string, string> = { 'content-type': 'application/json', authorization: `Bearer ${o.token ?? 'owner'}`, ...o.headers };
    if (method !== 'GET' && o.key !== null) headers['idempotency-key'] = o.key ?? `stories-test-key-${String(n).padStart(6, '0')}`;
    const res = await h.app.request(path, { method, headers, ...(o.body === undefined ? {} : { body: JSON.stringify(o.body) }) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, text };
  }
  return { repo, req, h };
}

describe('GET /v1/stories', () => {
  it('requires a valid session', async () => {
    const { req } = setup();
    expect((await req('GET', '/v1/stories', { token: 'nope' })).status).toBe(401);
    const res = await setup().h.app.request('/v1/stories');
    expect(res.status).toBe(401);
  });

  it('returns Brief, Client updates, Business update in that order, with the exact DTO shape', async () => {
    const { req } = setup();
    const res = await req('GET', '/v1/stories');
    expect(res.status).toBe(200);
    expect(res.body.data.stories.map((s: { kind: string }) => s.kind)).toEqual(['brief', 'clients', 'business']);
    expect(res.body.data.stories[0]).toEqual({
      id: BRIEF,
      kind: 'brief',
      title: 'Brief',
      tone: 'neutral',
      generatedAt: new Date(NOW.getTime() - 3_600_000).toISOString(),
      viewed: false,
      cards: [card('brief-1')],
    });
    expect(res.body.data.stories.map((s: { title: string }) => s.title)).toEqual(['Brief', 'Client updates', 'Business update']);
    expect(res.body.data.productUpdates).toEqual({ viewed: false, cards: [] });
  });

  it('omits empty stories and scopes to the caller’s business (no foreign or expired stories)', async () => {
    const { req } = setup({ stories: [row(CLIENTS, 'clients', { cards: [] }), row(BUSINESS, 'business')] });
    const res = await req('GET', '/v1/stories');
    expect(res.body.data.stories.map((s: { id: string }) => s.id)).toEqual([BUSINESS]);
    expect(res.text).not.toContain(FOREIGN);
    expect(res.text).not.toContain(EXPIRED);
  });

  it('serves the latest generation when a kind has two live stories', async () => {
    const newer = '30000000-0000-4000-8000-000000000007';
    const { req } = setup({ stories: [row(BUSINESS, 'business'), row(newer, 'business', { generatedAt: new Date(NOW.getTime() - 60_000).toISOString() })] });
    const res = await req('GET', '/v1/stories');
    expect(res.body.data.stories.map((s: { id: string }) => s.id)).toEqual([newer]);
  });

  it('tracks viewed per person', async () => {
    const { req } = setup();
    expect((await req('POST', `/v1/stories/${BRIEF}/view`, { body: { lastCardIndex: 1 } })).status).toBe(200);
    const owner = await req('GET', '/v1/stories');
    const staff = await req('GET', '/v1/stories', { token: 'staff' });
    const viewed = (r: typeof owner) => Object.fromEntries(r.body.data.stories.map((s: { kind: string; viewed: boolean }) => [s.kind, s.viewed]));
    expect(viewed(owner)).toEqual({ brief: true, clients: false, business: false });
    expect(viewed(staff)).toEqual({ brief: false, clients: false, business: false });
  });

  describe('product updates', () => {
    const undo = product('say-undo', { tags: { plans: ['starter', 'growth', 'pro'], roles: ['owner'], requires: ['companion', 'act_then_undo'] }, demo: 'undo', tone: 'positive', action: { label: 'Try it', deeplink: 'clovie://voice' } });
    const names = product('clients-by-name', { tags: { requires: ['companion'] }, demo: 'names' });

    it('shows each entry whose tags the caller matches, as presenter cards', async () => {
      const { req } = setup({ updates: [undo, names] });
      const res = await req('GET', '/v1/stories');
      expect(res.body.data.productUpdates.viewed).toBe(false);
      expect(res.body.data.productUpdates.cards.map((c: StoryCard) => c.id).sort()).toEqual(['clients-by-name', 'say-undo']);
      expect(res.body.data.productUpdates.cards.find((c: StoryCard) => c.id === 'say-undo')).toMatchObject({
        emotion: 'presenter',
        demo: 'undo',
        action: { label: 'Try it', deeplink: 'clovie://voice' },
      });
    });

    it('hides owner-only entries from staff and companion entries from the Free plan', async () => {
      const { req } = setup({ updates: [undo, names] });
      const staff = await req('GET', '/v1/stories', { token: 'staff' });
      expect(staff.body.data.productUpdates.cards.map((c: StoryCard) => c.id)).toEqual(['clients-by-name']);
      const free = setup({ plan: 'free', updates: [undo, names] });
      expect((await free.req('GET', '/v1/stories')).body.data.productUpdates.cards).toEqual([]);
    });

    it('filters by X-App-Version and X-Platform', async () => {
      const gated = product('gated', { tags: { minAppVersion: '1.10.0', platforms: ['ios'] } });
      const { req } = setup({ updates: [gated] });
      const cardsFor = async (headers: Record<string, string>) =>
        (await req('GET', '/v1/stories', { headers })).body.data.productUpdates.cards.length;
      expect(await cardsFor({})).toBe(0);
      expect(await cardsFor({ 'x-app-version': '1.9.0', 'x-platform': 'ios' })).toBe(0);
      expect(await cardsFor({ 'x-app-version': '1.10.0', 'x-platform': 'android' })).toBe(0);
      expect(await cardsFor({ 'x-app-version': '1.10.0', 'x-platform': 'tv' })).toBe(0);
      expect(await cardsFor({ 'x-app-version': '1.10.0', 'x-platform': 'ios' })).toBe(1);
    });

    it('stops showing an update once the caller has seen it, for that caller only', async () => {
      const { req } = setup({ updates: [names] });
      expect((await req('POST', '/v1/product-updates/view', { body: { ids: ['clients-by-name'] } })).status).toBe(200);
      expect((await req('GET', '/v1/stories')).body.data.productUpdates.cards).toEqual([]);
      expect((await req('GET', '/v1/stories', { token: 'staff' })).body.data.productUpdates.cards).toHaveLength(1);
    });
  });
});

describe('POST /v1/stories/:id/view', () => {
  it('stores the furthest card and is idempotent', async () => {
    const { req, repo } = setup();
    await req('POST', `/v1/stories/${BRIEF}/view`, { body: { lastCardIndex: 3 } });
    await req('POST', `/v1/stories/${BRIEF}/view`, { body: { lastCardIndex: 1 } });
    const same = await req('POST', `/v1/stories/${BRIEF}/view`, { body: { lastCardIndex: 3 } });
    expect(same.body).toEqual({ data: { viewed: true } });
    expect(repo.storyViews).toEqual([{ storyId: BRIEF, userId: OWNER_ID, lastCardIndex: 3 }]);
  });

  it('replays the stored response for the same Idempotency-Key', async () => {
    const { req, repo } = setup();
    const key = 'view-replay-key-0001';
    await req('POST', `/v1/stories/${BRIEF}/view`, { body: { lastCardIndex: 2 }, key });
    const again = await req('POST', `/v1/stories/${BRIEF}/view`, { body: { lastCardIndex: 2 }, key });
    expect(again.status).toBe(200);
    expect(repo.storyViews).toHaveLength(1);
  });

  it.each([
    ['another business’s story', FOREIGN, { lastCardIndex: 0 }, 404],
    ['an unknown story', '30000000-0000-4000-8000-0000000000ff', { lastCardIndex: 0 }, 404],
    ['a malformed id', 'not-a-uuid', { lastCardIndex: 0 }, 400],
    ['a negative card index', BRIEF, { lastCardIndex: -1 }, 400],
    ['a fractional card index', BRIEF, { lastCardIndex: 1.5 }, 400],
    ['a huge card index', BRIEF, { lastCardIndex: 5000 }, 400],
    ['a missing index', BRIEF, {}, 400],
    ['an unknown field', BRIEF, { lastCardIndex: 0, name: 'Thandi' }, 400],
  ])('rejects %s', async (_name, id, body, status) => {
    const { req, repo } = setup();
    const res = await req('POST', `/v1/stories/${id}/view`, { body });
    expect(res.status).toBe(status);
    expect(repo.storyViews).toEqual([]);
  });

  it('needs an Idempotency-Key', async () => {
    const { req } = setup();
    const res = await req('POST', `/v1/stories/${BRIEF}/view`, { body: { lastCardIndex: 0 }, key: null });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });
});

describe('POST /v1/product-updates/view', () => {
  it('records each known id once and ignores unknown ids', async () => {
    const { req, repo } = setup({ updates: [product('a'), product('b')] });
    expect((await req('POST', '/v1/product-updates/view', { body: { ids: ['a', 'a', 'nope', 'b'] } })).status).toBe(200);
    await req('POST', '/v1/product-updates/view', { body: { ids: ['a'] } });
    expect(repo.productViews).toEqual([
      { updateId: 'a', userId: OWNER_ID },
      { updateId: 'b', userId: OWNER_ID },
    ]);
  });

  it.each([
    ['no ids', { ids: [] }],
    ['too many ids', { ids: Array.from({ length: 21 }, (_, i) => `u${i}`) }],
    ['a bad id', { ids: ['Not A Slug!'] }],
    ['a missing field', {}],
  ])('rejects %s', async (_name, body) => {
    const { req } = setup();
    expect((await req('POST', '/v1/product-updates/view', { body })).status).toBe(400);
  });
});

describe('POST /v1/stories/events', () => {
  const event = (over: Record<string, unknown> = {}) => ({ storyKind: 'brief', storyId: BRIEF, cardIndex: 0, event: 'open', ...over });

  it('stores a batch with the caller’s business and user, never trusting client ids from another business', async () => {
    const { req, repo } = setup();
    const res = await req('POST', '/v1/stories/events', {
      body: { events: [event(), event({ cardIndex: 1, event: 'card_view' }), event({ storyId: FOREIGN, event: 'close' }), event({ storyKind: 'product', storyId: null, event: 'action' })] },
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ stored: 4 });
    expect(repo.events.map((e) => [e.businessId, e.userId, e.storyKind, e.storyId, e.cardIndex, e.event])).toEqual([
      [BIZ, OWNER_ID, 'brief', BRIEF, 0, 'open'],
      [BIZ, OWNER_ID, 'brief', BRIEF, 1, 'card_view'],
      [BIZ, OWNER_ID, 'brief', null, 0, 'close'],
      [BIZ, OWNER_ID, 'product', null, 0, 'action'],
    ]);
  });

  it('takes a plausible client time and replaces an implausible one with the server time', async () => {
    const { req, repo } = setup();
    const recent = new Date(NOW.getTime() - 60_000).toISOString();
    await req('POST', '/v1/stories/events', { body: { events: [event({ at: recent }), event({ at: '2020-01-01T00:00:00Z' }), event({ at: '2030-01-01T00:00:00Z' })] } });
    expect(repo.events.map((e) => e.at)).toEqual([recent, NOW.toISOString(), NOW.toISOString()]);
  });

  it('accepts exactly 50 events and rejects 51 or none', async () => {
    const { req, repo } = setup();
    expect((await req('POST', '/v1/stories/events', { body: { events: Array.from({ length: 50 }, () => event()) } })).status).toBe(201);
    expect(repo.events).toHaveLength(50);
    expect((await req('POST', '/v1/stories/events', { body: { events: Array.from({ length: 51 }, () => event()) } })).status).toBe(400);
    expect((await req('POST', '/v1/stories/events', { body: { events: [] } })).status).toBe(400);
    expect(repo.events).toHaveLength(50);
  });

  it.each([
    ['an unknown event name', event({ event: 'tap' })],
    ['an unknown story kind', event({ storyKind: 'secrets' })],
    ['a negative card index', event({ cardIndex: -1 })],
    ['a malformed story id', event({ storyId: 'abc' })],
    ['a bad timestamp', event({ at: 'yesterday' })],
    ['a free-text field (PII cannot ride along)', event({ name: 'Thandi Nkosi' })],
    ['a phone number field', event({ phone: '+27821234567' })],
  ])('rejects %s and stores nothing', async (_name, bad) => {
    const { req, repo } = setup();
    const res = await req('POST', '/v1/stories/events', { body: { events: [event(), bad] } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(repo.events).toEqual([]);
  });
});

describe('/cron/stories', () => {
  it('is registered, needs the cron secret, and answers with counts only', async () => {
    const { h, repo } = setup();
    repo.businesses.push({ id: BIZ, timezone: 'Africa/Johannesburg', currency: 'ZAR' });
    const denied = await h.app.request('/cron/stories', { method: 'POST' });
    expect(denied.status).toBe(401);
    const ok = await h.app.request('/cron/stories', { method: 'POST', headers: { 'x-cron-secret': 'cron-secret' } });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.data.job).toBe('stories');
    expect(Object.values(body.data.result).every((v) => typeof v === 'number')).toBe(true);
  });
});
