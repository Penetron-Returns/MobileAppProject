/** Route harness for plans, usage, companion and reports: the real Hono app over in-memory fakes. */
import { createApp } from '../../src/app.ts';
import type { Container } from '../../src/container.ts';
import type { ClerkClaims } from '../../src/middleware/auth.ts';
import { createCompanionService } from '@booking/companion/nerova/companionService.ts';
import type { Db } from '@booking/features/lib/db.ts';
import { createUsageService } from '@booking/features/plans/services/usage.ts';
import { fakeEntitlements } from '@booking/testing/entitlements.ts';
import { createFakeNerovaClient, type FakeNerovaAccount, type FakeNerovaClient } from '@booking/testing/nerova.ts';
import { createMemoryPlanRepository, type MemoryAppointment, type MemoryPlanRepository } from '@booking/testing/plans.ts';
import type { PlanKey } from '@booking/types';
import { memoryIdempotencyStore, TEST_ENV, testContainer } from '../helpers.ts';

export const BIZ = '10000000-0000-4000-8000-0000000000aa';
export const ORG = 'org_plans_test';
export const OWNER_ID = 'user_owner_clerk_id';
/** Tuesday 2026-10-13 12:00 SAST */
export const NOW = new Date('2026-10-13T10:00:00.000Z');
export const EMBED_ORIGIN = 'https://app.example.test';
export const NEROVA_KEY = 'nrv_live_super_secret_key_value';

const CLAIMS: Record<string, ClerkClaims> = {
  owner: { sub: OWNER_ID, org_id: ORG, org_role: 'org:admin' },
  staff: { sub: 'user_staff', org_id: ORG, org_role: 'org:member' },
};

function authDb(): Db {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { id: BIZ }, error: null }) };
  return { from: () => chain } as unknown as Db;
}

export interface PlansHarness {
  app: ReturnType<typeof createApp>;
  nerova: FakeNerovaClient;
  plans: MemoryPlanRepository;
  call(method: string, path: string, opts?: { token?: 'owner' | 'staff'; body?: unknown; key?: string }): Promise<{ status: number; body: any; text: string }>;
}

let keySeq = 0;

export function plansHarness(
  opts: {
    plan?: PlanKey;
    appointments?: MemoryAppointment[];
    accounts?: FakeNerovaAccount[];
    cachedAccountId?: string | null;
    timezone?: string;
    embedOrigin?: string | undefined;
    now?: Date;
  } = {},
): PlansHarness {
  const plan = opts.plan ?? 'growth';
  const now = opts.now ?? NOW;
  const clock = () => now;
  const plans = createMemoryPlanRepository(
    { [BIZ]: { plan, timezone: opts.timezone ?? 'Africa/Johannesburg', nerovaAccountId: opts.cachedAccountId ?? null } },
    opts.appointments ?? [],
  );
  const nerova = createFakeNerovaClient({ accounts: opts.accounts, clock });
  const container: Container = testContainer({
    db: authDb(),
    env: { ...TEST_ENV, NEROVA_API_KEY: NEROVA_KEY },
    entitlements: fakeEntitlements(plan),
    usage: createUsageService({ repo: plans, clock }),
    companion: createCompanionService({
      nerova,
      plans,
      embedOrigin: 'embedOrigin' in opts ? opts.embedOrigin : EMBED_ORIGIN,
      clock,
    }),
    clock,
  });
  const store = memoryIdempotencyStore();
  const app = createApp({
    getContainer: () => container,
    verifyToken: async (token) => {
      const claims = CLAIMS[token];
      if (!claims) throw new Error('bad token');
      return claims;
    },
    idempotencyStore: () => store,
  });

  async function call(method: string, path: string, o: { token?: 'owner' | 'staff'; body?: unknown; key?: string } = {}) {
    keySeq += 1;
    const headers: Record<string, string> = { 'content-type': 'application/json', authorization: `Bearer ${o.token ?? 'owner'}` };
    if (method !== 'GET') headers['idempotency-key'] = o.key ?? `plans-test-key-${String(keySeq).padStart(6, '0')}`;
    const res = await app.request(path, { method, headers, ...(o.body === undefined ? {} : { body: JSON.stringify(o.body) }) });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { status: res.status, body, text };
  }

  return { app, nerova, plans, call };
}

/** An appointment helper: SAST wall-clock start, minutes long, defaults to a confirmed 'app' booking worth R250. */
export function appt(startLocal: string, over: Partial<MemoryAppointment> & { minutes?: number } = {}): MemoryAppointment {
  const startsAt = new Date(`${startLocal}:00+02:00`);
  const endsAt = new Date(startsAt.getTime() + (over.minutes ?? 60) * 60_000);
  return {
    businessId: BIZ,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    status: 'confirmed',
    source: 'app',
    priceCents: 25000,
    createdAt: startsAt.toISOString(),
    ...over,
  };
}
