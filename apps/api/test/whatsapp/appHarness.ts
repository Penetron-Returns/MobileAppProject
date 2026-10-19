/** WhatsApp route harness: the real Hono app over the fake WhatsApp deps. */
import { createApp } from '../../src/app.ts';
import type { Container } from '../../src/container.ts';
import type { Env } from '../../src/env.ts';
import type { ClerkClaims } from '../../src/middleware/auth.ts';
import type { Db } from '@booking/features/lib/db.ts';
import type { WaContainer } from '@booking/app-store/whatsapp/deps.ts';
import type { WaAccountRow } from '@booking/app-store/whatsapp/repo.ts';
import { signMetaBody } from '@booking/app-store/whatsapp/signature.ts';
import { BIZ, type World } from '@booking/testing/whatsapp/world.ts';
import { harness, type Harness } from '@booking/testing/whatsapp/harness.ts';
import { memoryIdempotencyStore, TEST_ENV, testContainer } from '../helpers.ts';

export const ORG = 'org_wa_test';

const CLAIMS: Record<string, ClerkClaims> = {
  owner: { sub: 'user_owner', org_id: ORG, org_role: 'org:admin' },
  staff: { sub: 'user_staff', org_id: ORG, org_role: 'org:member' },
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

export interface CallOptions {
  token?: 'owner' | 'staff' | null;
  body?: unknown;
  key?: string | null;
  headers?: Record<string, string>;
  raw?: string;
}

export interface AppHarness extends Harness {
  app: ReturnType<typeof createApp>;
  container: Container & Pick<WaContainer, 'whatsapp'>;
  call(method: string, path: string, opts?: CallOptions): Promise<{ status: number; body: any; text: string }>;
  /** POSTs a signed webhook payload */
  webhook(payload: unknown, signature?: string): Promise<{ status: number; body: any }>;
}

let keySeq = 0;

export function appHarness(
  opts: {
    world?: World;
    account?: Partial<WaAccountRow> | null;
    env?: Partial<Env> & Record<string, string | undefined>;
  } = {},
): AppHarness {
  const h = harness(opts);
  if (opts.env) h.deps.env = { ...h.deps.env, ...opts.env };
  const container: Container & Pick<WaContainer, 'whatsapp'> = {
    ...testContainer({
      booking: h.booking,
      db: authDb(BIZ),
      env: { ...TEST_ENV, ...h.deps.env },
    }),
    whatsapp: h.deps,
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

  async function call(method: string, path: string, o: CallOptions = {}) {
    const token = o.token === undefined ? 'owner' : o.token;
    keySeq += 1;
    const key = o.key === undefined ? `wa-test-key-${String(keySeq).padStart(6, '0')}` : o.key;
    const headers: Record<string, string> = { 'content-type': 'application/json', ...(o.headers ?? {}) };
    if (token) headers.authorization = `Bearer ${token}`;
    if (key && method !== 'GET') headers['idempotency-key'] = key;
    const body = o.raw ?? (o.body === undefined ? undefined : JSON.stringify(o.body));
    const res = await app.request(path, { method, headers, ...(body === undefined ? {} : { body }) });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    return { status: res.status, body: parsed, text };
  }

  async function webhook(payload: unknown, signature?: string) {
    const raw = JSON.stringify(payload);
    const sig = signature ?? signMetaBody(h.deps.env.META_APP_SECRET!, raw);
    const r = await call('POST', '/webhooks/whatsapp', {
      token: null,
      key: null,
      raw,
      headers: { 'x-hub-signature-256': sig },
    });
    return { status: r.status, body: r.body };
  }

  return { ...h, app, container, call, webhook };
}
