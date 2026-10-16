import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { createSupabaseRepository } from '@booking/features/repositories/supabase.ts';
import type { Db } from '@booking/features/lib/db.ts';
import { createEntitlementService } from '@booking/features/plans/services/entitlements.ts';

interface Captured {
  method: string;
  path: string;
  params: URLSearchParams;
}

/** Supabase client whose fetch records requests and answers per path. */
function fakeDb(reply: (req: Captured) => unknown) {
  const requests: Captured[] = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const req = { method: init?.method ?? 'GET', path: url.pathname.replace('/rest/v1', ''), params: url.searchParams };
    requests.push(req);
    return new Response(JSON.stringify(reply(req)), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const db = createClient('http://localhost:54321', 'service-role', {
    auth: { persistSession: false },
    global: { fetch: fetchImpl as typeof fetch },
  }) as unknown as Db;
  return { db, requests };
}

const BIZ = '11111111-1111-4111-8111-111111111111';

describe('listAppointmentsInWindow (Supabase)', () => {
  it('scopes by business, filters on starts_at, orders by (starts_at, id) and limits', async () => {
    const { db, requests } = fakeDb(() => []);
    await createSupabaseRepository(db).listAppointmentsInWindow(BIZ, {
      fromIso: '2026-09-30T00:00:00.000Z',
      toIso: '2026-10-01T00:00:00.000Z',
      staffId: 's1',
      clientId: 'c1',
      status: 'confirmed',
      after: { startsAt: '2026-09-30T07:00:00.000Z', id: 'a1' },
      limit: 11,
    });
    const p = requests[0]!.params;
    expect(requests[0]!.path).toBe('/appointments');
    expect(p.get('business_id')).toBe(`eq.${BIZ}`);
    expect(p.getAll('starts_at')).toContain('gte.2026-09-30T00:00:00.000Z');
    expect(p.getAll('starts_at')).toContain('lt.2026-10-01T00:00:00.000Z');
    expect(p.get('staff_id')).toBe('eq.s1');
    expect(p.get('client_id')).toBe('eq.c1');
    expect(p.get('status')).toBe('eq.confirmed');
    expect(p.get('or')).toBe('(starts_at.gt.2026-09-30T07:00:00.000Z,and(starts_at.eq.2026-09-30T07:00:00.000Z,id.gt.a1))');
    expect(p.get('order')).toBe('starts_at.asc,id.asc');
    expect(p.get('limit')).toBe('11');
  });

  it('omits optional filters when they are not given', async () => {
    const { db, requests } = fakeDb(() => []);
    await createSupabaseRepository(db).listAppointmentsInWindow(BIZ, { fromIso: 'a', toIso: 'b', limit: 5 });
    const p = requests[0]!.params;
    expect(['staff_id', 'client_id', 'status', 'or'].map((k) => p.get(k))).toEqual([null, null, null, null]);
  });
});

describe('client lookups (Supabase)', () => {
  it('finds a client by phone within the business', async () => {
    const { db, requests } = fakeDb(() => null);
    expect(await createSupabaseRepository(db).findClientByPhone(BIZ, '+27820000000')).toBeNull();
    const p = requests[0]!.params;
    expect([p.get('business_id'), p.get('phone_e164')]).toEqual([`eq.${BIZ}`, 'eq.+27820000000']);
  });

  it('finds a client by email case-insensitively, with LIKE wildcards escaped, within the business', async () => {
    const { db, requests } = fakeDb(() => null);
    expect(await createSupabaseRepository(db).findClientByEmail(BIZ, 'a_b@example.com')).toBeNull();
    const p = requests[0]!.params;
    expect([p.get('business_id'), p.get('email')]).toEqual([`eq.${BIZ}`, 'ilike.a\\_b@example.com']);
  });

  it('prefilters clients by name with one capped, business-scoped ILIKE query', async () => {
    const { db, requests } = fakeDb(() => []);
    const repo = createSupabaseRepository(db);
    expect(await repo.listClientsByNamePatterns(BIZ, [], 200)).toEqual([]);
    expect(requests).toHaveLength(0);
    await repo.listClientsByNamePatterns(BIZ, ['%tha%', '%_di%'], 200);
    expect(requests).toHaveLength(1);
    const p = requests[0]!.params;
    expect(p.get('business_id')).toBe(`eq.${BIZ}`);
    expect(p.get('or')).toBe('(name.ilike.*tha*,name.ilike.*_di*)');
    expect(p.get('limit')).toBe('200');
  });

  it('loads clients by id in one business-scoped query, and none for no ids', async () => {
    const { db, requests } = fakeDb(() => []);
    const repo = createSupabaseRepository(db);
    expect(await repo.listClientsByIds(BIZ, [])).toEqual([]);
    expect(requests).toHaveLength(0);
    await repo.listClientsByIds(BIZ, ['c1', 'c2']);
    expect(requests[0]!.params.get('business_id')).toBe(`eq.${BIZ}`);
    expect(requests[0]!.params.get('id')).toBe('in.(c1,c2)');
  });
});

describe('listBusinessIdsWithFeature', () => {
  it('finds the plans that carry the feature, then businesses on them after the cursor', async () => {
    const { db, requests } = fakeDb((req) =>
      req.path === '/plan_features'
        ? [{ plan: 'starter' }, { plan: 'growth' }, { plan: 'starter' }]
        : [{ id: 'b1' }, { id: 'b2' }],
    );
    const ids = await createEntitlementService({ db }).listBusinessIdsWithFeature('companion', { after: 'a0', limit: 3 });
    expect(ids).toEqual(['b1', 'b2']);
    expect(requests[0]!.params.get('feature')).toBe('eq.companion');
    const businesses = requests[1]!;
    expect(businesses.path).toBe('/businesses');
    expect(businesses.params.get('plan')).toBe('in.(starter,growth)');
    expect(businesses.params.get('id')).toBe('gt.a0');
    expect(businesses.params.get('order')).toBe('id.asc');
    expect(businesses.params.get('limit')).toBe('3');
  });

  it('returns nothing, without a second query, when no plan has the feature', async () => {
    const { db, requests } = fakeDb(() => []);
    expect(await createEntitlementService({ db }).listBusinessIdsWithFeature('companion', { limit: 5 })).toEqual([]);
    expect(requests).toHaveLength(1);
  });
});
