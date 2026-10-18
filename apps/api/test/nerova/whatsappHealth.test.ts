import { beforeEach, describe, expect, it } from 'vitest';

import { signStandardWebhook } from '@booking/companion/events/events.ts';
import { createHttpNerovaClient } from '@booking/companion/nerova/httpClient.ts';
import { parseWhatsAppHealth } from '@booking/companion/nerova/whatsappHealth.ts';
import { createApp } from '../../src/app.ts';
import { memoryIdempotencyStore, TEST_ENV, testContainer, type BookingContainer } from '../helpers.ts';
import { NOW, seed } from '../booking/fixtures.ts';
import { NEROVA_KEY } from '../plans/harness.ts';

const FULL = {
  phoneNumberStatus: 'flagged',
  qualityRating: 'yellow',
  messagingLimitTier: 'tier_1k',
  verifiedName: 'Harbour Salon',
  nameStatus: 'pending_review',
  templates: [
    { name: 'reminder', category: 'utility', status: 'approved', rejectedReason: null },
    { name: 'promo', category: 'marketing', status: 'rejected', rejectedReason: 'Unclear opt-in' },
  ],
  lastError: { code: 131047, message: 'Re-engagement message', at: '2026-10-18T08:00:00Z' },
  lastHealthCheckAt: '2026-10-18T09:00:00Z',
};

describe('parseWhatsAppHealth', () => {
  it('maps a full payload to snake_case DTO fields', () => {
    expect(parseWhatsAppHealth(FULL)).toEqual({
      phone_number_status: 'flagged',
      quality_rating: 'yellow',
      messaging_limit_tier: 'tier_1k',
      verified_name: 'Harbour Salon',
      name_status: 'pending_review',
      templates: [
        { name: 'reminder', category: 'utility', status: 'approved', rejected_reason: null },
        { name: 'promo', category: 'marketing', status: 'rejected', rejected_reason: 'Unclear opt-in' },
      ],
      last_error: { code: '131047', message: 'Re-engagement message', at: '2026-10-18T08:00:00Z' },
      last_health_check_at: '2026-10-18T09:00:00Z',
    });
  });

  it('omits every field Nerova did not send', () => {
    expect(parseWhatsAppHealth({ connected: true, state: 'connected' })).toEqual({});
    expect(parseWhatsAppHealth(undefined)).toEqual({});
  });

  it('keeps explicit nulls for verified name, last error and check time', () => {
    expect(parseWhatsAppHealth({ verifiedName: null, lastError: null, lastHealthCheckAt: null })).toEqual({ verified_name: null, last_error: null, last_health_check_at: null });
  });

  it('maps unknown enum values to unknown and drops nameless templates', () => {
    expect(
      parseWhatsAppHealth({
        phoneNumberStatus: 'banned',
        qualityRating: 'purple',
        messagingLimitTier: 'tier_1m',
        nameStatus: 'whatever',
        templates: [{ name: 'x', category: 'authentication', status: 'in_appeal' }, { status: 'approved' }, 'junk'],
      }),
    ).toEqual({
      phone_number_status: 'unknown',
      quality_rating: 'unknown',
      messaging_limit_tier: 'unknown',
      name_status: 'unknown',
      templates: [{ name: 'x', category: 'authentication', status: 'unknown', rejected_reason: null }],
    });
  });
});

describe('getCompanionSetup health', () => {
  it('carries the whatsApp health into the setup status', async () => {
    const impl = (async () => new Response(JSON.stringify({ nextStep: 'none', whatsApp: { connected: true, state: 'connected', ...FULL } }), { status: 200 })) as unknown as typeof fetch;
    const setup = await createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: impl }).getCompanionSetup('acct_1');
    expect(setup?.whatsapp.health.quality_rating).toBe('yellow');
    expect(setup?.whatsapp.health.templates).toHaveLength(2);
    expect(setup?.whatsapp.connected).toBe(true);
  });
});

const SECRET = `whsec_${Buffer.alloc(32, 5).toString('base64')}`;
let app: ReturnType<typeof createApp>;
let seq = 0;

beforeEach(() => {
  const s = seed();
  const container = { ...testContainer({ clock: () => NOW, env: { ...TEST_ENV, NEROVA_WEBHOOK_SECRET: SECRET } }), bookingRepository: s.repo } as BookingContainer;
  app = createApp({ getContainer: () => container, idempotencyStore: () => memoryIdempotencyStore() });
});

async function deliver(id?: string, signature?: string) {
  seq += 1;
  const webhookId = id ?? `evt_h${seq}`;
  const raw = JSON.stringify({ id: webhookId, type: 'channel.health_changed', apiVersion: '2026-07-01', createdAt: NOW.toISOString(), livemode: true, data: { object: { accountId: 'acct_1', whatsApp: FULL } } });
  const ts = Math.floor(NOW.getTime() / 1000);
  const res = await app.request('/webhooks/nerova', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'webhook-id': webhookId, 'webhook-timestamp': String(ts), 'webhook-signature': signature ?? signStandardWebhook(SECRET, webhookId, ts, raw) },
    body: raw,
  });
  return { status: res.status, body: (await res.json()) as unknown };
}

describe('channel.health_changed webhook', () => {
  it('is accepted', async () => {
    expect(await deliver()).toEqual({ status: 200, body: { data: { status: 'accepted' } } });
  });

  it('acknowledges a redelivery as a duplicate', async () => {
    await deliver('evt_hdup');
    expect((await deliver('evt_hdup')).body).toEqual({ data: { status: 'duplicate' } });
  });

  it('rejects a bad signature with 401', async () => {
    expect((await deliver(undefined, 'v1,AAAA')).status).toBe(401);
  });
});
