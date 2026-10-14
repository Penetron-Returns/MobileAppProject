import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { getEnv } from '../../src/env.ts';
import {
  createAccountEvents,
  createHttpEventSender,
  disabledEventSender,
  eventSenderFromEnv,
  signStandardWebhook,
  type AccountEvent,
} from '../../src/nerova/events.ts';
import { silentLogger, harness } from '../booking/harness.ts';
import { plansEntitlements } from './harness.ts';

// whsec_ + base64("nerova-signing-key-0123456789abcd")
const SECRET = `whsec_${Buffer.from('nerova-signing-key-0123456789abcd').toString('base64')}`;
const BIZ = '11111111-1111-4111-8111-111111111111';
const FIXED = new Date('2026-10-14T10:00:00.000Z');

describe('Standard Webhooks signing', () => {
  it('signs "<id>.<timestamp>.<body>" with the base64-decoded key', () => {
    const body = '{"id":"evt_1","type":"account.updated"}';
    const expected = createHmac('sha256', Buffer.from('nerova-signing-key-0123456789abcd')).update(`evt_1.1760436000.${body}`).digest('base64');
    expect(signStandardWebhook(SECRET, 'evt_1', 1760436000, body)).toBe(`v1,${expected}`);
  });

  it('changes when any part changes', () => {
    const base = signStandardWebhook(SECRET, 'evt_1', 1, 'a');
    expect(signStandardWebhook(SECRET, 'evt_2', 1, 'a')).not.toBe(base);
    expect(signStandardWebhook(SECRET, 'evt_1', 2, 'a')).not.toBe(base);
    expect(signStandardWebhook(SECRET, 'evt_1', 1, 'b')).not.toBe(base);
  });
});

describe('createHttpEventSender', () => {
  it('posts the event with webhook-id, timestamp and a verifiable signature', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const sender = createHttpEventSender({
      url: 'https://nerova.test/events',
      signingSecret: SECRET,
      clock: () => FIXED,
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(null, { status: 200 });
      }) as unknown as typeof fetch,
    });
    const event: AccountEvent = { id: 'evt_9', type: 'account.updated', createdAt: FIXED.toISOString(), data: { id: BIZ } };
    await sender.send(event);

    const { url, init } = calls[0]!;
    const headers = init.headers as Record<string, string>;
    expect(url).toBe('https://nerova.test/events');
    expect(headers['webhook-id']).toBe('evt_9');
    expect(headers['webhook-timestamp']).toBe(String(FIXED.getTime() / 1000));
    expect(JSON.parse(init.body as string)).toEqual(event);
    expect(headers['webhook-signature']).toBe(signStandardWebhook(SECRET, 'evt_9', FIXED.getTime() / 1000, init.body as string));
  });

  it('throws when Nerova answers a non-2xx', async () => {
    const sender = createHttpEventSender({
      url: 'https://nerova.test/events',
      signingSecret: SECRET,
      fetch: (async () => new Response(null, { status: 500 })) as unknown as typeof fetch,
    });
    await expect(sender.send({ id: 'e', type: 'account.created', createdAt: '', data: { id: BIZ } })).rejects.toThrow('500');
  });
});

describe('eventSenderFromEnv', () => {
  const env = (over: Record<string, string | undefined>) => getEnv({ SUPABASE_URL: 'http://localhost:54321', SUPABASE_SERVICE_ROLE_KEY: 'k', ...over });

  it('is disabled by default and when the toggle is not exactly "true"', () => {
    expect(eventSenderFromEnv(env({}), silentLogger)).toBe(disabledEventSender);
    expect(eventSenderFromEnv(env({ NEROVA_EVENTS_ENABLED: 'yes', NEROVA_EVENTS_URL: 'https://x', NEROVA_EVENTS_SIGNING_SECRET: SECRET }), silentLogger)).toBe(disabledEventSender);
  });

  it('stays disabled when enabled without a URL or secret, or with a plain-http remote URL', () => {
    expect(eventSenderFromEnv(env({ NEROVA_EVENTS_ENABLED: 'true' }), silentLogger)).toBe(disabledEventSender);
    expect(
      eventSenderFromEnv(env({ NEROVA_EVENTS_ENABLED: 'true', NEROVA_EVENTS_URL: 'http://nerova.example/events', NEROVA_EVENTS_SIGNING_SECRET: SECRET }), silentLogger),
    ).toBe(disabledEventSender);
  });

  it('turns on only with the toggle, an https (or loopback) URL and the secret', () => {
    const on = eventSenderFromEnv(env({ NEROVA_EVENTS_ENABLED: 'true', NEROVA_EVENTS_URL: 'https://nerova.test/e', NEROVA_EVENTS_SIGNING_SECRET: SECRET }), silentLogger);
    expect(on).not.toBe(disabledEventSender);
    const local = eventSenderFromEnv(env({ NEROVA_EVENTS_ENABLED: 'true', NEROVA_EVENTS_URL: 'http://127.0.0.1:9/e', NEROVA_EVENTS_SIGNING_SECRET: SECRET }), silentLogger);
    expect(local).not.toBe(disabledEventSender);
  });
});

describe('createAccountEvents', () => {
  const paid = () => plansEntitlements(new Map([[BIZ, 'starter']]));
  const free = () => plansEntitlements(new Map([[BIZ, 'free']]));
  function setup(entitlements = paid(), failWith?: Error) {
    const sent: AccountEvent[] = [];
    const events = createAccountEvents({
      sender: { send: async (e) => (failWith ? Promise.reject(failWith) : void sent.push(e)) },
      entitlements,
      logger: silentLogger,
      clock: () => FIXED,
      newId: () => 'evt_fixed',
    });
    return { sent, events };
  }

  it('sends account.updated and account.created for a business on a companion plan', async () => {
    const { sent, events } = setup();
    await events.accountChanged(BIZ, 'account.updated');
    await events.accountChanged(BIZ, 'account.created');
    expect(sent).toEqual([
      { id: 'evt_fixed', type: 'account.updated', createdAt: FIXED.toISOString(), data: { id: BIZ } },
      { id: 'evt_fixed', type: 'account.created', createdAt: FIXED.toISOString(), data: { id: BIZ } },
    ]);
  });

  it('never announces a Free business or an unknown one', async () => {
    const { sent, events } = setup(free());
    await events.accountChanged(BIZ, 'account.updated');
    await events.accountChanged('22222222-2222-4222-8222-222222222222', 'account.created');
    expect(sent).toEqual([]);
  });

  it('always sends account.removed, so a downgraded account is paused on their side', async () => {
    const { sent, events } = setup(free());
    await events.accountChanged(BIZ, 'account.removed');
    expect(sent.map((e) => e.type)).toEqual(['account.removed']);
  });

  it('swallows delivery failures', async () => {
    const { events } = setup(paid(), new Error('network down'));
    await expect(events.accountChanged(BIZ, 'account.updated')).resolves.toBeUndefined();
  });
});

describe('account events from the owner API', () => {
  it('fires account.updated after the business or its hours change, and not on failures', async () => {
    const seen: { businessId: string; type: string }[] = [];
    const h = harness({ nerovaEvents: { accountChanged: async (businessId, type) => void seen.push({ businessId, type }) } });
    expect((await h.call('PATCH', '/v1/business', { body: { name: 'Renamed' } })).status).toBe(200);
    expect((await h.call('PUT', '/v1/business/hours', { body: { hours: [{ weekday: 1, opens_at: '09:00', closes_at: '17:00' }] } })).status).toBe(200);
    expect(seen).toEqual([
      { businessId: h.business.id, type: 'account.updated' },
      { businessId: h.business.id, type: 'account.updated' },
    ]);
    expect((await h.call('PATCH', '/v1/business', { body: { timezone: 'Not/AZone' } })).status).toBe(400);
    expect((await h.call('PATCH', '/v1/business', { token: 'staff', body: { name: 'x' } })).status).toBe(403);
    expect(seen).toHaveLength(2);
  });
});
