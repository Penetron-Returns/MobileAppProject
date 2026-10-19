import { beforeEach, describe, expect, it } from 'vitest';

import { signStandardWebhook } from '@booking/companion/events/events.ts';
import type { SupportDeps } from '@booking/companion/support/supportEscalation.ts';
import type { SupportAlert } from '@booking/features/support/ports.ts';
import type { AttendancePushMessage } from '@booking/features/attendance/ports.ts';
import { createFakeSupportRepository, type FakeSupportRepository } from '@booking/testing/supportRequests.ts';
import { createApp } from '../../src/app.ts';
import { memoryIdempotencyStore, TEST_ENV, testContainer, type BookingContainer } from '../helpers.ts';
import { NOW, seed, type Seed } from '../booking/fixtures.ts';

const SECRET = `whsec_${Buffer.alloc(32, 5).toString('base64')}`;
const ACCOUNT = 'acct_1';
const SUMMARY = 'My WhatsApp number says restricted and I cannot send reminders';

let s: Seed;
let support: FakeSupportRepository;
let pushes: { userIds: string[]; message: AttendancePushMessage }[];
let alerts: SupportAlert[];
let alertFails: boolean;
let logs: { event: string; fields: unknown }[];
let app: ReturnType<typeof createApp>;
let seq = 0;

beforeEach(() => {
  s = seed();
  support = createFakeSupportRepository({ accounts: { [ACCOUNT]: s.business.id }, ownerIds: { [s.business.id]: ['user_owner'] }, businessNames: { [s.business.id]: 'Harbour Salon' } });
  pushes = [];
  alerts = [];
  alertFails = false;
  logs = [];
  const log = (event: string, fields?: unknown) => logs.push({ event, fields });
  const supportDeps: SupportDeps = {
    repo: support,
    push: {
      async toUsers(_b, userIds, message) {
        pushes.push({ userIds, message });
        return userIds.length;
      },
    },
    logger: { debug: log, info: log, warn: log, error: log } as unknown as SupportDeps['logger'],
    clock: () => NOW,
    alerts: {
      async send(alert) {
        if (alertFails) throw new Error('resend down');
        alerts.push(alert);
      },
    },
  };
  const container = { ...testContainer({ clock: () => NOW, env: { ...TEST_ENV, NEROVA_WEBHOOK_SECRET: SECRET } }), bookingRepository: s.repo, supportDeps } as BookingContainer;
  app = createApp({ getContainer: () => container, idempotencyStore: () => memoryIdempotencyStore() });
});

const envelope = (type: string, object: Record<string, unknown>) => ({ id: 'evt', type, apiVersion: '2026-07-01', createdAt: NOW.toISOString(), livemode: true, data: { object } });
const raised = (over: Record<string, unknown> = {}) => ({
  accountId: ACCOUNT,
  source: 'owner_support',
  summary: SUMMARY,
  whatsAppHealth: { phoneNumberStatus: 'restricted', qualityRating: 'red', billing: { paymentMethodAttached: false, currency: 'ZAR' } },
  ...over,
});

async function deliver(body: unknown, id?: string) {
  seq += 1;
  const webhookId = id ?? `evt_${seq}`;
  const raw = JSON.stringify(body);
  const ts = Math.floor(NOW.getTime() / 1000);
  const res = await app.request('/webhooks/nerova', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'webhook-id': webhookId, 'webhook-timestamp': String(ts), 'webhook-signature': signStandardWebhook(SECRET, webhookId, ts, raw) },
    body: raw,
  });
  await new Promise((r) => setTimeout(r, 0));
  return { status: res.status, body: (await res.json()) as unknown };
}

describe('POST /webhooks/nerova owner_support escalations', () => {
  it('stores an open support request with the health snapshot and pushes the owner', async () => {
    const res = await deliver(envelope('escalation.raised', raised()));
    expect(res).toEqual({ status: 200, body: { data: { status: 'accepted' } } });
    expect(support.rows).toHaveLength(1);
    expect(support.rows[0]).toMatchObject({
      business_id: s.business.id,
      nerova_account_id: ACCOUNT,
      status: 'open',
      summary: SUMMARY,
      health: { phone_number_status: 'restricted', quality_rating: 'red', billing: { payment_method_attached: false, currency: 'ZAR' } },
    });
    expect(pushes).toEqual([{ userIds: ['user_owner'], message: expect.objectContaining({ title: 'We got your message', body: 'Support will reply on WhatsApp.' }) }]);
    expect(s.repo.tables.webhook_events[0]).toMatchObject({ source: 'nerova', processed_at: expect.any(String) });
  });

  it('never logs the owner text', async () => {
    await deliver(envelope('escalation.raised', raised()));
    expect(logs.some((l) => l.event === 'support_request_opened')).toBe(true);
    expect(JSON.stringify(logs)).not.toContain('cannot send reminders');
  });

  it('stores one request when Nerova redelivers the same webhook-id', async () => {
    await deliver(envelope('escalation.raised', raised()), 'evt_dup');
    const second = await deliver(envelope('escalation.raised', raised()), 'evt_dup');
    expect(second.body).toEqual({ data: { status: 'duplicate' } });
    expect(support.rows).toHaveLength(1);
    expect(pushes).toHaveLength(1);
  });

  it('resolves the account open requests on escalation.resolved', async () => {
    await deliver(envelope('escalation.raised', raised()));
    const res = await deliver(envelope('escalation.resolved', { accountId: ACCOUNT, source: 'owner_support' }));
    expect(res.status).toBe(200);
    expect(support.rows[0]).toMatchObject({ status: 'resolved', resolved_at: NOW.toISOString() });
  });

  it('accepts and stores nothing for an unknown account', async () => {
    const res = await deliver(envelope('escalation.raised', raised({ accountId: 'acct_unknown' })));
    expect(res.status).toBe(200);
    expect(support.rows).toHaveLength(0);
    expect(pushes).toHaveLength(0);
  });

  it('answers 400 for a malformed owner_support payload and stores nothing', async () => {
    const res = await deliver(envelope('escalation.raised', { accountId: ACCOUNT, source: 'owner_support' }));
    expect(res.status).toBe(400);
    expect(support.rows).toHaveLength(0);
    expect(s.repo.tables.webhook_events).toHaveLength(0);
  });

  it('only logs escalations from other sources', async () => {
    const res = await deliver(envelope('escalation.raised', { accountId: ACCOUNT, source: 'client_chat', summary: 'x' }));
    expect(res).toEqual({ status: 200, body: { data: { status: 'ignored' } } });
    expect(support.rows).toHaveLength(0);
    expect(pushes).toHaveLength(0);
  });
});

describe('POST /webhooks/nerova support alert email', () => {
  const finalPayload = (over: Record<string, unknown> = {}) =>
    raised({
      category: 'whatsapp_connection',
      reason: 'number restricted',
      status: 'open',
      raisedAt: '2026-10-19T10:00:00.000Z',
      escalation: { id: 'esc_9' },
      someNewField: 'tolerated',
      ...over,
    });

  it('sends one alert with business, category, reason, health and escalation id for a new request', async () => {
    const res = await deliver(envelope('escalation.raised', finalPayload()));
    expect(res.status).toBe(200);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      businessId: s.business.id,
      businessName: 'Harbour Salon',
      category: 'whatsapp_connection',
      reason: 'number restricted',
      summary: SUMMARY,
      raisedAt: '2026-10-19T10:00:00.000Z',
      escalationId: 'esc_9',
      healthSummary: 'status restricted, quality red, verification unknown, billing payment method missing',
    });
  });

  it('does not send again for a replayed webhook', async () => {
    await deliver(envelope('escalation.raised', finalPayload()), 'evt_alert_dup');
    await deliver(envelope('escalation.raised', finalPayload()), 'evt_alert_dup');
    expect(alerts).toHaveLength(1);
  });

  it('does not send for an unknown account or for a resolve', async () => {
    await deliver(envelope('escalation.raised', finalPayload({ accountId: 'acct_unknown' })));
    await deliver(envelope('escalation.resolved', { accountId: ACCOUNT, source: 'owner_support' }));
    expect(alerts).toHaveLength(0);
  });

  it('still answers 200, stores the request and logs a warning when the sender throws', async () => {
    alertFails = true;
    const res = await deliver(envelope('escalation.raised', finalPayload()));
    expect(res).toEqual({ status: 200, body: { data: { status: 'accepted' } } });
    expect(support.rows).toHaveLength(1);
    expect(logs.some((l) => l.event === 'support_alert_failed')).toBe(true);
  });
});
