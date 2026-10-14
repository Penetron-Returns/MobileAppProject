import { createApp } from '../../src/app.ts';
import type { BookingContainer } from '../../src/booking/index.ts';
import { createBookingServiceFromRepository } from '../../src/booking/service.ts';
import type { Env } from '../../src/env.ts';
import type { Db } from '../../src/lib/db.ts';
import type { Logger } from '../../src/lib/logger.ts';
import type { ClerkClaims } from '../../src/middleware/auth.ts';
import type { AccountEventsPort, AppointmentChangedEvent } from '../../src/ports.ts';
import { createFakeClerkAdmin, type FakeClerkAdmin } from '../fakes/clerkAdmin.ts';
import { memoryIdempotencyStore, TEST_ENV, testContainer } from '../helpers.ts';
import { NOW, seed, type Seed } from './fixtures.ts';

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {}, child: () => silentLogger };

const CLAIMS: Record<string, ClerkClaims> = {
  owner: { sub: 'user_owner', org_id: 'org_test', org_role: 'org:admin' },
  staff: { sub: 'user_staff', org_id: 'org_test', org_role: 'org:member' },
  noorg: { sub: 'user_lonely' },
  newowner: { sub: 'user_new', org_id: 'org_new', org_role: 'org:admin' },
  newstaff: { sub: 'user_member', org_id: 'org_new', org_role: 'org:member' },
  owner2: { sub: 'user_owner2', org_id: 'org_test', org_role: 'org:admin' },
  invitee: { sub: 'user_invitee', org_id: 'org_test', org_role: 'org:member' },
  otherowner: { sub: 'user_other', org_id: 'org_other', org_role: 'org:admin' },
};

/** Minimal Db for requireAuth's businesses lookup (org → business id). */
function authDb(businessId: string): Db {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: { id: businessId }, error: null }),
  };
  return { from: () => chain } as unknown as Db;
}

export interface RequestOptions {
  token?: keyof typeof CLAIMS | 'bad' | null;
  body?: unknown;
  key?: string | null;
  headers?: Record<string, string>;
}

export interface Harness extends Seed {
  app: ReturnType<typeof createApp>;
  events: AppointmentChangedEvent[];
  clerk: FakeClerkAdmin;
  call(method: string, path: string, opts?: RequestOptions): Promise<{ status: number; body: any; headers: Headers }>;
}

let keySeq = 0;

export function harness(opts: { env?: Partial<Env>; nerovaEvents?: AccountEventsPort } = {}): Harness {
  const s = seed();
  const events: AppointmentChangedEvent[] = [];
  const clerk = createFakeClerkAdmin();
  const booking = createBookingServiceFromRepository({
    repository: s.repo,
    notifications: { appointmentChanged: async (e) => void events.push(e) },
    logger: silentLogger,
    clock: () => NOW,
  });
  const container: BookingContainer = {
    ...testContainer({
      booking,
      db: authDb(s.business.id),
      clerkAdmin: clerk,
      env: { ...TEST_ENV, ...opts.env },
      ...(opts.nerovaEvents ? { nerovaEvents: opts.nerovaEvents } : {}),
    }),
    bookingRepository: s.repo,
  };
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

  async function call(method: string, path: string, o: RequestOptions = {}) {
    const token = o.token === undefined ? 'owner' : o.token;
    keySeq += 1;
    const key = o.key === undefined ? `test-key-${String(keySeq).padStart(6, '0')}` : o.key;
    const headers: Record<string, string> = { 'content-type': 'application/json', ...(o.headers ?? {}) };
    if (token) headers.authorization = `Bearer ${token}`;
    if (key && method !== 'GET') headers['idempotency-key'] = key;
    const res = await app.request(path, {
      method,
      headers,
      ...(o.body === undefined ? {} : { body: typeof o.body === 'string' ? o.body : JSON.stringify(o.body) }),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  }

  return { ...s, app, events, clerk, call };
}
