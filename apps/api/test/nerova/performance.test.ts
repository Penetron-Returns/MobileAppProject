import { describe, expect, it } from 'vitest';

import { createBookingServiceFromRepository } from '@booking/features/bookings/services/bookingService.ts';
import { createTtlCache } from '@booking/companion/connector/cache.ts';
import { NOW, sast } from '../booking/fixtures.ts';
import { silentLogger } from '../booking/harness.ts';
import { nerovaHarness } from './harness.ts';

interface Counted<T> {
  port: T;
  calls: Map<string, number>;
  total: () => number;
}

/** Counts calls to every function property of a port, by name. */
function counted<T extends object>(target: T): Counted<T> {
  const calls = new Map<string, number>();
  const port = new Proxy(target, {
    get(obj, key, receiver) {
      const value: unknown = Reflect.get(obj, key, receiver);
      if (typeof value !== 'function' || typeof key !== 'string') return value;
      return (...args: unknown[]) => {
        calls.set(key, (calls.get(key) ?? 0) + 1);
        return (value as (...a: unknown[]) => unknown).apply(obj, args);
      };
    },
  });
  return { port, calls, total: () => [...calls.values()].reduce((a, b) => a + b, 0) };
}

function countingHarness(ttlMs: string) {
  const spies: { repo?: Counted<any>; entitlements?: Counted<any>; booking?: Counted<any> } = {};
  const h = nerovaHarness({
    env: { NEROVA_CONNECTOR_CACHE_TTL_MS: ttlMs },
    wrapRepo: (r) => (spies.repo = counted(r)).port,
    wrapEntitlements: (e) => (spies.entitlements = counted(e)).port,
    wrapBooking: (b) => (spies.booking = counted(b)).port,
  });
  return { h, repo: spies.repo!, entitlements: spies.entitlements!, booking: spies.booking! };
}

describe('connector handshake fast paths', () => {
  it('answers initialize, initialized, ping and tools/list without any repository, entitlement or booking call', async () => {
    const { h, repo, entitlements, booking } = countingHarness('30000');
    const init = await h.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'nerova', version: '1' } });
    expect(init.status).toBe(200);
    expect(init.body.result.serverInfo.name).toBe('booking-nerova-connector');
    const initialized = await h.rpc('notifications/initialized', undefined, { id: null });
    expect(initialized.status).toBe(202);
    expect(initialized.body).toBeNull();
    expect((await h.rpc('ping')).body.result).toEqual({});
    expect((await h.rpc('tools/list')).body.result.tools).toHaveLength(14);
    expect(repo.total()).toBe(0);
    expect(entitlements.total()).toBe(0);
    expect(booking.total()).toBe(0);
  });
});

describe('connector read cache', () => {
  it('serves a repeated services_list from cache with no further repository or entitlement calls', async () => {
    const { h, repo, entitlements } = countingHarness('30000');
    const args = { accountId: h.business.id };
    const first = await h.ok('services_list', args);
    const repoAfterFirst = repo.total();
    expect(repoAfterFirst).toBeGreaterThan(0);
    expect(entitlements.total()).toBe(1);

    const second = await h.ok('services_list', args);
    expect(second).toEqual(first);
    expect(repo.total()).toBe(repoAfterFirst);
    expect(entitlements.total()).toBe(1);
  });

  it('does not cache when the TTL is 0', async () => {
    const { h, entitlements } = countingHarness('0');
    await h.ok('services_list', { accountId: h.business.id });
    await h.ok('services_list', { accountId: h.business.id });
    expect(entitlements.total()).toBe(2);
  });

  it('never caches availability: a booking made through the connector is visible to the next search', async () => {
    const { h } = countingHarness('30000');
    const args = { accountId: h.business.id, serviceId: h.colour.id, staffId: h.thandi.id, start: sast('00:00'), end: sast('00:00', '2026-10-01') };
    const before = await h.ok('availability_search', args);
    expect(before.data.some((s: { startTime: string }) => s.startTime === sast('09:00'))).toBe(true);
    await h.ok('appointments_create', {
      accountId: h.business.id, idempotencyKey: 'perf-1', externalServiceId: h.colour.id, externalStaffId: h.thandi.id,
      startTime: sast('09:00'), client: { name: 'Zed', phone: '+27821110000' },
    });
    const after = await h.ok('availability_search', args);
    expect(after.data.some((s: { startTime: string }) => s.startTime === sast('09:00'))).toBe(false);
  });
});

describe('availability_search round trips', () => {
  const windowOf = (h: { business: { id: string }; cut: { id: string } }) => ({
    accountId: h.business.id, serviceId: h.cut.id, start: sast('00:00', '2026-09-30'), end: sast('00:00', '2026-10-14'),
  });

  it('loads busy time and hours once for a two week window instead of once per day', async () => {
    const { h, repo } = countingHarness('30000');
    const { data } = await h.ok('availability_search', windowOf(h));
    expect(data.length).toBeGreaterThan(0);
    expect(repo.calls.get('listBusy')).toBe(1);
    expect(repo.calls.get('listBusinessHours')).toBe(1);
    const starts = data.map((s: { startTime: string }) => s.startTime);
    expect(starts).toEqual([...starts].sort());
  });

  it('returns the same slots as computing each date on its own', async () => {
    const h = nerovaHarness();
    const args = windowOf(h);
    const { data } = await h.ok('availability_search', args);

    const reference = createBookingServiceFromRepository({
      repository: h.repo, notifications: { appointmentChanged: async () => {} }, logger: silentLogger,
    });
    const now = NOW;
    const dates = Array.from({ length: 14 }, (_, i) => new Date(Date.UTC(2026, 8, 30 + i)).toISOString().slice(0, 10));
    const start = Date.parse(args.start);
    const end = Date.parse(args.end);
    const perDate = await Promise.all(dates.map((date) => reference.listAvailableSlots({ businessId: h.business.id, serviceId: h.cut.id, date, now })));
    const expected = perDate
      .flatMap((day) => day.slots)
      .filter((slot) => Date.parse(slot.starts_at) >= start && Date.parse(slot.ends_at) <= end)
      .flatMap((slot) => slot.staff_ids.map((id) => ({ startTime: slot.starts_at, endTime: slot.ends_at, externalStaffId: id })));
    expect(expected.length).toBeGreaterThan(0);
    expect(data).toEqual(expected);
  });
});

describe('ttl cache', () => {
  it('shares one in-flight load, expires by clock, evicts least recently used and forgets failures', async () => {
    let now = 0;
    const cache = createTtlCache<number>({ ttlMs: 100, maxEntries: 2, nowMs: () => now });
    let loads = 0;
    const load = (v: number) => async () => {
      loads += 1;
      return v;
    };

    const [a, b] = await Promise.all([cache.get('a', load(1)), cache.get('a', load(1))]);
    expect([a, b, loads]).toEqual([1, 1, 1]);
    now = 99;
    await cache.get('a', load(1));
    expect(loads).toBe(1);
    now = 100;
    await cache.get('a', load(1));
    expect(loads).toBe(2);

    await cache.get('b', load(2));
    await cache.get('a', load(1)); // touch a, so b is the oldest
    await cache.get('c', load(3));
    expect(cache.size).toBe(2);
    loads = 0;
    await cache.get('a', load(1));
    expect(loads).toBe(0);
    await cache.get('b', load(2));
    expect(loads).toBe(1);

    await expect(cache.get('bad', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await cache.get('bad', async () => 7)).toBe(7);

    cache.invalidate('a');
    loads = 0;
    await cache.get('a', load(1));
    expect(loads).toBe(1);
  });
});
