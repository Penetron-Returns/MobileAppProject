import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { FeatureKey, PlanKey } from '../../../../packages/shared/api.ts';
import { getMe } from '../../src/booking/admin.ts';
import type { Db } from '../../src/lib/db.ts';
import { AppError } from '../../src/lib/errors.ts';
import { createEntitlementService, FEATURE_KEYS } from '../../src/plans/entitlements.ts';
import { signFlowToken } from '../../src/whatsapp/flows/token.ts';
import { handleFlowRequest } from '../../src/whatsapp/flows/handler.ts';
import { seed } from '../booking/fixtures.ts';
import { fakeEntitlements, PLAN_FEATURES } from '../helpers.ts';
import { appHarness, buttonMsg, CUSTOMER_PHONE, harness, inbound, NOW, textMsg } from '../whatsapp/fakes.ts';

const FEATURE_NOT_IN_PLAN = 'FEATURE_NOT_IN_PLAN';

describe('plan catalogue', () => {
  it('keeps the test fake identical to the migration seed', () => {
    const sql = readFileSync(new URL('../../../../supabase/migrations/20261014000001_plan_flags.sql', import.meta.url), 'utf8');
    const seeded: Record<string, string[]> = {};
    for (const m of sql.matchAll(/\('(\w+)',\s+'(\w+)',\s+(null|\d+)\)/g)) {
      (seeded[m[1]!] ??= []).push(m[2]!);
      expect(m[3], `${m[1]}/${m[2]} caps are undecided`).toBe('null');
    }
    expect(Object.keys(seeded).sort()).toEqual(Object.keys(PLAN_FEATURES).sort());
    for (const plan of Object.keys(PLAN_FEATURES) as PlanKey[]) {
      expect(seeded[plan]!.sort(), plan).toEqual([...PLAN_FEATURES[plan]].sort());
    }
  });

  it('only uses feature keys the contract knows', () => {
    for (const features of Object.values(PLAN_FEATURES)) {
      for (const f of features) expect(FEATURE_KEYS).toContain(f);
    }
  });

  it('gives free the WhatsApp menu and inbox but no AI, and paid plans the opposite', () => {
    const has = (plan: PlanKey, f: FeatureKey) => PLAN_FEATURES[plan].includes(f);
    expect(has('free', 'whatsapp_menu') && has('free', 'inbox')).toBe(true);
    expect(has('free', 'companion')).toBe(false);
    for (const plan of ['starter', 'growth', 'pro'] as const) {
      expect(has(plan, 'companion')).toBe(true);
      expect(has(plan, 'desktop_app')).toBe(true);
      expect(has(plan, 'whatsapp_menu')).toBe(false);
      expect(has(plan, 'inbox')).toBe(false);
    }
    for (const plan of ['free', 'starter', 'growth', 'pro'] as const) expect(has(plan, 'extensions')).toBe(true);
  });
});

describe('createEntitlementService', () => {
  function dbReturning(result: { data: unknown; error: unknown }, seen: unknown[] = []): Db {
    return {
      rpc: async (fn: string, args: unknown) => {
        seen.push([fn, args]);
        return result;
      },
    } as unknown as Db;
  }

  const rows = [
    { plan: 'growth', feature: 'companion', monthly_limit: null },
    { plan: 'growth', feature: 'assistant_bookings', monthly_limit: 500 },
    { plan: 'growth', feature: 'future_thing', monthly_limit: null },
  ];

  it('maps business_features rows, keeps limits and ignores unknown keys', async () => {
    const seen: unknown[] = [];
    const svc = createEntitlementService({ db: dbReturning({ data: rows, error: null }, seen) });
    expect(await svc.getEntitlements('b1')).toEqual({
      plan: 'growth',
      features: [
        { feature: 'companion', monthly_limit: null },
        { feature: 'assistant_bookings', monthly_limit: 500 },
      ],
    });
    expect(seen).toEqual([['business_features', { p_business_id: 'b1' }]]);
  });

  it('answers hasFeature from the same rows', async () => {
    const svc = createEntitlementService({ db: dbReturning({ data: rows, error: null }) });
    expect(await svc.hasFeature('b1', 'companion')).toBe(true);
    expect(await svc.hasFeature('b1', 'inbox')).toBe(false);
    expect(await svc.hasFeature('b1', 'whatsapp_menu')).toBe(false);
  });

  it('is NOT_FOUND for an unknown business and maps database errors', async () => {
    const missing = createEntitlementService({ db: dbReturning({ data: [], error: null }) });
    await expect(missing.getEntitlements('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const broken = createEntitlementService({ db: dbReturning({ data: null, error: { code: 'XX000', message: 'boom' } }) });
    await expect(broken.getEntitlements('b1')).rejects.toBeInstanceOf(AppError);
  });
});

describe('GET /v1/me', () => {
  it('exposes the plan and features', async () => {
    const s = seed();
    const me = await getMe(s.repo, { userId: 'u1', businessId: s.business.id, role: 'owner' }, await fakeEntitlements('growth', { assistant_bookings: 100 }).getEntitlements(s.business.id));
    expect(me.plan).toBe('growth');
    expect(me.features).toContainEqual({ feature: 'assistant_bookings', monthly_limit: 100 });
    expect(me.features.map((f) => f.feature)).not.toContain('inbox');
  });
});

const WHATSAPP_ROUTES: [string, string, unknown][] = [
  ['GET', '/v1/whatsapp', undefined],
  ['POST', '/v1/whatsapp/embedded-signup', { code: 'c', waba_id: 'w', phone_number_id: 'p' }],
  ['POST', '/v1/whatsapp/connect', { waba_id: 'w', phone_number_id: 'p', access_token: 't' }],
  ['POST', '/v1/whatsapp/sync', {}],
  ['POST', '/v1/whatsapp/pause', {}],
  ['POST', '/v1/whatsapp/resume', {}],
  ['POST', '/v1/whatsapp/disconnect', {}],
  ['POST', '/v1/whatsapp/test-message', { to: '+27821234567' }],
];

const INBOX_ROUTES: [string, string, unknown][] = [
  ['POST', '/v1/conversations/00000000-0000-4000-8000-000000000001/messages', { text: 'hi' }],
  ['POST', '/v1/conversations/00000000-0000-4000-8000-000000000001/release', {}],
  ['POST', '/v1/escalations/00000000-0000-4000-8000-000000000001/resolve', {}],
];

describe('route gating', () => {
  it.each(['starter', 'growth', 'pro'] as const)('blocks the whatsapp_menu routes on %s with 403 FEATURE_NOT_IN_PLAN', async (plan) => {
    const h = appHarness({ plan });
    for (const [method, path, body] of WHATSAPP_ROUTES) {
      const r = await h.call(method, path, { body });
      expect(r.status, `${method} ${path}`).toBe(403);
      expect(r.body.error).toMatchObject({ code: FEATURE_NOT_IN_PLAN, details: { feature: 'whatsapp_menu' } });
    }
  });

  it.each(['starter', 'growth', 'pro'] as const)('blocks the inbox routes on %s with 403 FEATURE_NOT_IN_PLAN', async (plan) => {
    const h = appHarness({ plan });
    for (const [method, path, body] of INBOX_ROUTES) {
      const r = await h.call(method, path, { body });
      expect(r.status, `${method} ${path}`).toBe(403);
      expect(r.body.error).toMatchObject({ code: FEATURE_NOT_IN_PLAN, details: { feature: 'inbox' } });
    }
  });

  it('blocks staff as well as owners (the gate is about the plan, not the role)', async () => {
    const h = appHarness({ plan: 'growth' });
    const r = await h.call('POST', INBOX_ROUTES[1]![1], { token: 'staff', body: {} });
    expect(r.body.error.code).toBe(FEATURE_NOT_IN_PLAN);
  });

  it('lets the free plan through to the real handlers', async () => {
    const h = appHarness({ plan: 'free' });
    const status = await h.call('GET', '/v1/whatsapp');
    expect(status.status).toBe(200);
    // Past the gate: the unknown conversation is a plain 404, not a plan error.
    const release = await h.call('POST', INBOX_ROUTES[1]![1], { body: {} });
    expect(release.body?.error?.code).not.toBe(FEATURE_NOT_IN_PLAN);
  });

  it('does not gate unrelated /v1 routes', async () => {
    const h = appHarness({ plan: 'growth' });
    const r = await h.call('GET', '/v1/whatsapp-nope');
    expect(r.body.error.code).toBe('NOT_FOUND');
  });
});

describe('WhatsApp webhook gating', () => {
  it('stays silent for a business without whatsapp_menu: 200, noted, no reply, no conversation', async () => {
    const h = appHarness({ plan: 'growth' });
    const r = await h.webhook(inbound(textMsg('wamid.PAID1')));
    expect(r.status).toBe(200);
    expect(h.graph.sent).toHaveLength(0);
    expect(h.repo.db.messages).toHaveLength(0);
    expect(h.repo.db.conversations).toHaveLength(0);
    expect(h.repo.db.clients).toHaveLength(0);
    expect(h.repo.db.webhookEvents).toHaveLength(1);
    expect(h.repo.db.webhookEvents[0]).toMatchObject({ error: 'feature_not_in_plan' });
  });

  it('ignores button replies the same way', async () => {
    const h = appHarness({ plan: 'pro' });
    await h.webhook(inbound(buttonMsg('menu:book')));
    expect(h.graph.sent).toHaveLength(0);
  });

  it('still runs the menu for the free plan', async () => {
    const h = appHarness({ plan: 'free' });
    await h.webhook(inbound(textMsg('wamid.FREE1')));
    expect(h.graph.sent.length).toBeGreaterThan(0);
  });
});

describe('WhatsApp flow gating', () => {
  it('closes a flow (427) for a business without whatsapp_menu', async () => {
    const h = harness({ plan: 'growth' });
    const client = await h.repo.upsertClientByPhone(h.world.business.id, CUSTOMER_PHONE, null);
    const conv = await h.repo.getOrCreateConversation(h.world.business.id, client.id);
    const token = signFlowToken('flow-secret', { conversationId: conv.id, subject: '00000000-0000-4000-8000-0000000a7777', now: NOW });
    expect(await handleFlowRequest(h.deps, { version: '3.0', action: 'INIT', flow_token: token })).toEqual({ status: 427 });
  });
});
