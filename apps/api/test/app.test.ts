import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.ts';
import { AppError, mapDbError } from '../src/lib/errors.ts';
import { redact } from '../src/lib/logger.ts';
import { decryptSecret, encryptSecret } from '../src/lib/crypto.ts';
import { orgFromClaims } from '../src/middleware/auth.ts';
import { baseContext, errorHandler } from '../src/middleware/common.ts';
import { idempotency } from '../src/middleware/idempotency.ts';
import type { AppEnv } from '../src/types.ts';
import { memoryIdempotencyStore, TEST_ENV, testContainer } from './helpers.ts';

describe('app shell', () => {
  it('serves /health with a request id', async () => {
    const app = createApp({ getContainer: () => testContainer() });
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('returns the error envelope for unknown routes', async () => {
    const app = createApp({ getContainer: () => testContainer() });
    const res = await app.request('/nope');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; request_id: string } };
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.request_id).toBeTruthy();
  });

  it('rejects /v1 without a bearer token', async () => {
    const app = createApp({ getContainer: () => testContainer() });
    const res = await app.request('/v1/me');
    expect(res.status).toBe(401);
  });

  it('guards cron with the shared secret', async () => {
    const app = createApp({ getContainer: () => testContainer() });
    expect((await app.request('/cron/cleanup', { method: 'POST' })).status).toBe(401);
    const ok = await app.request('/cron/cleanup', { method: 'POST', headers: { 'x-cron-secret': 'cron-secret' } });
    expect(ok.status).toBe(200);
  });
});

describe('idempotency middleware', () => {
  function build() {
    const store = memoryIdempotencyStore();
    let calls = 0;
    const app = new Hono<AppEnv>();
    app.onError(errorHandler);
    app.use('*', baseContext(() => testContainer()));
    app.use('*', idempotency(() => store));
    app.post('/things', async (c) => {
      calls += 1;
      const body = await c.req.json();
      return c.json({ data: { n: calls, echo: body } }, 201);
    });
    return { app, store, calls: () => calls };
  }
  const post = (app: Hono<AppEnv>, key: string | null, body: unknown) =>
    app.request('/things', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
      body: JSON.stringify(body),
    });

  it('requires a key on mutations', async () => {
    const { app } = build();
    const res = await post(app, null, {});
    expect(res.status).toBe(400);
  });

  it('replays the stored response for the same key and body', async () => {
    const { app, calls } = build();
    const a = await post(app, 'key-00000001', { x: 1 });
    const b = await post(app, 'key-00000001', { x: 1 });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(await b.json()).toEqual(await a.json());
    expect(b.headers.get('idempotent-replay')).toBe('true');
    expect(calls()).toBe(1);
  });

  it('rejects key reuse with a different body', async () => {
    const { app } = build();
    await post(app, 'key-00000002', { x: 1 });
    const res = await post(app, 'key-00000002', { x: 2 });
    expect(res.status).toBe(422);
  });
});

describe('lib', () => {
  it('maps SQLSTATEs to API errors', () => {
    expect(mapDbError({ code: '23P01', message: 'conflict' }).code).toBe('SLOT_UNAVAILABLE');
    const rule = mapDbError({ code: 'P0001', message: 'RULE:STAFF_NOT_QUALIFIED:Staff cannot perform this service' });
    expect(rule).toBeInstanceOf(AppError);
    expect(rule.details).toEqual({ rule: 'STAFF_NOT_QUALIFIED' });
    expect(rule.message).toBe('Staff cannot perform this service');
  });

  it('redacts PII', () => {
    expect(redact({ name: 'Nadia', from: '+27821234567', nested: { text: 'hi' } })).toEqual({
      name: '[redacted]',
      from: '***4567',
      nested: { text: '[redacted]' },
    });
  });

  it('round-trips encrypted secrets', () => {
    const ct = encryptSecret('EAAG-token', TEST_ENV.TOKEN_ENCRYPTION_KEY!);
    expect(ct.startsWith('v1:')).toBe(true);
    expect(decryptSecret(ct, TEST_ENV.TOKEN_ENCRYPTION_KEY!)).toBe('EAAG-token');
  });

  it('reads org + role from Clerk v1 and v2 claims', () => {
    expect(orgFromClaims({ sub: 'u', org_id: 'org_1', org_role: 'org:admin' })).toEqual({ orgId: 'org_1', role: 'owner' });
    expect(orgFromClaims({ sub: 'u', o: { id: 'org_2', rol: 'member' } })).toEqual({ orgId: 'org_2', role: 'staff' });
  });
});
