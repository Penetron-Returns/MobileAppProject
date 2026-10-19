import { describe, expect, it } from 'vitest';

import { parseWhatsAppHealth } from '@booking/companion/nerova/whatsappHealth.ts';
import { createHttpNerovaClient } from '@booking/companion/nerova/httpClient.ts';
import { BIZ, NEROVA_KEY, plansHarness } from './harness.ts';

const ready = { id: 'acct_100', externalReference: BIZ, provisioningState: 'ready' };
const path = '/v1/companion/whatsapp-health';

const NEW_FIELDS = {
  billing: { paymentMethodAttached: false, currency: 'ZAR' },
  recentSendFailures: [
    { code: 131026, title: 'Message undeliverable', count: 3, lastAt: '2026-10-18T08:00:00Z' },
    { code: null, title: null, count: 2 },
    'junk',
  ],
};

describe('parseWhatsAppHealth billing and send failures', () => {
  it('maps the new optional fields to snake_case and drops junk entries', () => {
    expect(parseWhatsAppHealth(NEW_FIELDS)).toEqual({
      billing: { payment_method_attached: false, currency: 'ZAR' },
      recent_send_failures: [{ code: '131026', title: 'Message undeliverable', count: 3, last_at: '2026-10-18T08:00:00Z' }],
    });
  });

  it('leaves them out when Nerova has not shipped them', () => {
    expect(parseWhatsAppHealth({ qualityRating: 'green' })).toEqual({ quality_rating: 'green' });
  });
});

describe('GET /v1/companion/whatsapp-health', () => {
  it('uses the dedicated Nerova endpoint when it exists', async () => {
    const h = plansHarness({
      plan: 'growth',
      accounts: [{ ...ready, whatsappHealthEndpoint: { connected: true, displayPhoneNumber: '+27 82 000 0000', businessVerificationStatus: 'verified', health: { quality_rating: 'green', billing: { payment_method_attached: true, currency: 'ZAR' } } } }],
    });
    const r = await h.call('GET', path);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({
      connected: true,
      display_phone_number: '+27 82 000 0000',
      business_verification_status: 'verified',
      quality_rating: 'green',
      billing: { payment_method_attached: true, currency: 'ZAR' },
    });
  });

  it('falls back to the setup read while the endpoint is not shipped', async () => {
    const h = plansHarness({
      plan: 'growth',
      accounts: [{ ...ready, whatsapp: { connected: true, displayPhoneNumber: '+27 82 111 1111', health: { messaging_limit_tier: 'tier_250' } } }],
    });
    const r = await h.call('GET', path);
    expect(r.body.data).toEqual({ connected: true, display_phone_number: '+27 82 111 1111', business_verification_status: null, messaging_limit_tier: 'tier_250' });
  });

  it('answers not connected when the business has no Nerova account', async () => {
    const r = await plansHarness({ plan: 'growth', accounts: [] }).call('GET', path);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ connected: false, display_phone_number: null, business_verification_status: null });
  });

  it('lets staff read it', async () => {
    const r = await plansHarness({ plan: 'growth', accounts: [ready] }).call('GET', path, { token: 'staff' });
    expect(r.status).toBe(200);
  });

  it('is gated on the companion feature', async () => {
    const r = await plansHarness({ plan: 'free', accounts: [ready] }).call('GET', path);
    expect(r.status).toBe(403);
  });

  it('surfaces a Nerova outage as an upstream error', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [ready] });
    h.nerova.failWith = new (await import('@booking/features/lib/errors.ts')).AppError('UPSTREAM_COMPANION_ERROR', 'down');
    expect((await h.call('GET', path)).status).toBe(502);
  });
});

describe('createHttpNerovaClient.getWhatsAppHealth', () => {
  it('calls the account whatsapp-health path and maps the body', async () => {
    const calls: string[] = [];
    const impl = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ connected: true, displayPhoneNumber: '+1 555', businessVerificationStatus: 'pending', ...NEW_FIELDS }), { status: 200 });
    }) as unknown as typeof fetch;
    const health = await createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: impl }).getWhatsAppHealth('acct_1');
    expect(calls[0]).toBe('https://api.nerova.si/v1/accounts/acct_1/whatsapp-health');
    expect(health).toMatchObject({ connected: true, displayPhoneNumber: '+1 555', businessVerificationStatus: 'pending', health: { billing: { currency: 'ZAR' } } });
  });

  it('returns null on 404 so the caller can fall back', async () => {
    const impl = (async () => new Response('{}', { status: 404 })) as unknown as typeof fetch;
    expect(await createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: impl }).getWhatsAppHealth('acct_1')).toBeNull();
  });
});
