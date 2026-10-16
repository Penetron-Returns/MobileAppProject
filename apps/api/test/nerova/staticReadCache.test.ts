import { describe, expect, it } from 'vitest';

import { withEntitlementCache, withStaticReadCache } from '@booking/companion/connector/staticReadCache.ts';
import type { EntitlementService } from '@booking/features/ports.ts';
import { invalidateConnectorCache } from '../../src/routes/nerova.ts';
import { ENDPOINT, CONNECTOR_TOKEN, nerovaHarness } from './harness.ts';
import { seed } from '../booking/fixtures.ts';

describe('withStaticReadCache', () => {
  it('serves a repeat read from cache, then reloads after the TTL', async () => {
    const { repo } = seed();
    let calls = 0;
    const real = repo.listServices.bind(repo);
    repo.listServices = (...args) => (calls++, real(...args));
    let now = 0;
    const cache = withStaticReadCache(repo, { ttlMs: 30_000, nowMs: () => now });
    const businessId = repo.tables.businesses[0]!.id;
    await cache.repo.listServices(businessId);
    await cache.repo.listServices(businessId);
    expect(calls).toBe(1);
    now = 30_000;
    await cache.repo.listServices(businessId);
    expect(calls).toBe(2);
  });

  it('keeps businesses apart and invalidates one without touching the other', async () => {
    const { repo } = seed();
    const loads: string[] = [];
    const real = repo.listServices.bind(repo);
    repo.listServices = (id, ...rest) => (loads.push(id), real(id, ...rest));
    const cache = withStaticReadCache(repo, { ttlMs: 30_000 });
    await cache.repo.listServices('biz-a');
    await cache.repo.listServices('biz-b');
    expect(loads).toEqual(['biz-a', 'biz-b']);
    cache.invalidate('biz-a');
    await cache.repo.listServices('biz-a');
    await cache.repo.listServices('biz-b');
    expect(loads).toEqual(['biz-a', 'biz-b', 'biz-a']);
  });
});

describe('withEntitlementCache', () => {
  it('caches per business and feature, never leaks one business answer to another, and invalidates by business', async () => {
    const asked: string[] = [];
    const inner: EntitlementService = {
      getEntitlements: async () => ({ plan: 'free', features: [] }),
      hasFeature: async (businessId) => (asked.push(businessId), businessId === 'paid'),
      listBusinessIdsWithFeature: async () => [],
    };
    let now = 0;
    const cache = withEntitlementCache(inner, { ttlMs: 60_000, nowMs: () => now });
    expect(await cache.hasFeature('paid', 'companion')).toBe(true);
    expect(await cache.hasFeature('free', 'companion')).toBe(false);
    expect(await cache.hasFeature('paid', 'companion')).toBe(true);
    expect(asked).toEqual(['paid', 'free']);
    cache.invalidate('paid');
    await cache.hasFeature('paid', 'companion');
    await cache.hasFeature('free', 'companion');
    expect(asked).toEqual(['paid', 'free', 'paid']);
    now = 60_000;
    await cache.hasFeature('free', 'companion');
    expect(asked).toEqual(['paid', 'free', 'paid', 'free']);
  });
});

describe('connector route', () => {
  it('serves a changed plan immediately after invalidateConnectorCache, and only for that business', async () => {
    const h = nerovaHarness({ env: { NEROVA_CONNECTOR_CACHE_TTL_MS: '30000' } });
    const args = { accountId: h.business.id };
    await h.ok('services_list', args);
    h.plans.set(h.business.id, 'free');
    expect((await h.tool('services_list', args)).isError).toBeUndefined(); // still cached
    invalidateConnectorCache(h.container, h.freeBusinessId); // another business: no effect
    expect((await h.tool('services_list', args)).isError).toBeUndefined();
    invalidateConnectorCache(h.container, h.business.id);
    const after = await h.tool('services_list', args);
    expect(after.isError).toBe(true);
    expect(after.structuredContent.code).toBe('not_found');
  });

  it('answers a tool call with a Server-Timing header and no PII', async () => {
    const h = nerovaHarness();
    const res = await h.app.request(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${CONNECTOR_TOKEN}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'services_list', arguments: { accountId: h.business.id } } }),
    });
    expect(res.headers.get('server-timing')).toMatch(/^total;dur=\d+, db;dur=\d+;desc="\d+ queries"$/);
  });
});
