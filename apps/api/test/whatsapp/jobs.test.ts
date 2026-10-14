import { describe, expect, it } from 'vitest';

import { decryptSecret, encryptSecret } from '@booking/features/lib/crypto.ts';
import { GraphError } from '@booking/app-store/whatsapp/graph.ts';
import {
  runConversationExpiry,
  runReminders,
  runTokenRefresh,
  runWabaHealth,
} from '@booking/app-store/whatsapp/jobs.ts';
import {
  appointment,
  BIZ,
  buttonMsg,
  CUSTOMER_PHONE,
  harness,
  inbound,
  NOW,
  templateButtonMsg,
  type Harness,
} from '@booking/testing/whatsapp/index.ts';
import { appHarness } from './appHarness.ts';

const APPT = '00000000-0000-4000-8000-00000000aaaa';
const STARTS = '2026-09-29T07:00:00.000Z';

async function withReminder(h: Harness, over: { starts_at?: string } = {}) {
  const client = await h.repo.upsertClientByPhone(BIZ, CUSTOMER_PHONE, 'Thandi');
  h.world.appointments.push(appointment({ id: APPT, client_id: client.id, starts_at: STARTS }));
  h.repo.db.reminderQueue.push({ appointment_id: APPT, business_id: BIZ, client_id: client.id, offset_minutes: 1440, starts_at: over.starts_at ?? STARTS });
  return client;
}

describe('reminders job', () => {
  it('sends booking_reminder with Keep / Reschedule / Cancel and marks the claim sent', async () => {
    const h = harness();
    await withReminder(h);
    expect(await runReminders(h.deps)).toEqual({ claimed: 1, sent: 1, failed: 0, skipped: 0 });
    const p = h.graph.sent[0]!.payload as any;
    expect(p.template.name).toBe('booking_reminder');
    expect(p.template.components.slice(1).map((c: any) => c.parameters[0].payload)).toEqual([
      `appt:keep:${APPT}`,
      `appt:resched:${APPT}`,
      `appt:cancel:${APPT}`,
    ]);
    const event = h.repo.db.appointmentEvents.find((e) => e.type === 'reminder_sent')!;
    expect(event.payload).toMatchObject({ offset_minutes: 1440, starts_at: STARTS, state: 'sent', message_id: h.repo.db.messages[0]!.id });
    expect(h.repo.db.messages[0]!.body).toMatchObject({ template: 'booking_reminder', dedupe_key: `reminder:${APPT}:1440:${STARTS}` });
  });

  it.each([
    ['the appointment moved since the claim', (h: Harness) => (h.world.appointments[0]!.starts_at = '2026-09-30T07:00:00.000Z'), 'moved'],
    ['the appointment was cancelled', (h: Harness) => (h.world.appointments[0]!.status = 'cancelled'), 'not_confirmed'],
    ['the client opted out', (h: Harness) => (h.repo.db.clients[0]!.whatsapp_opt_in = false), 'opted_out'],
    ['the channel is paused', (h: Harness) => (h.repo.db.accounts[0]!.status = 'paused'), 'channel_not_live'],
  ])('skips when %s', async (_label, arrange, reason) => {
    const h = harness();
    await withReminder(h);
    arrange(h);
    expect(await runReminders(h.deps)).toMatchObject({ claimed: 1, skipped: 1, sent: 0 });
    expect(h.graph.sent).toHaveLength(0);
    expect(h.repo.db.appointmentEvents[0]!.payload).toMatchObject({ state: 'skipped', reason, offset_minutes: 1440, starts_at: STARTS });
  });

  it('marks a failed send and keeps going', async () => {
    const h = harness();
    await withReminder(h);
    h.graph.failNext(new GraphError({ message: 'Template paused', status: 400, code: 132015 }));
    expect(await runReminders(h.deps)).toMatchObject({ failed: 1 });
    expect(h.repo.db.appointmentEvents[0]!.payload).toMatchObject({ state: 'failed', code: 132015 });
  });

  it('routes the Keep / Cancel quick replies through the engine', async () => {
    const h = appHarness();
    const client = await h.repo.upsertClientByPhone(BIZ, CUSTOMER_PHONE, null);
    h.world.appointments.push(appointment({ id: APPT, client_id: client.id, starts_at: '2026-10-05T07:00:00.000Z' }));
    await h.webhook(inbound(templateButtonMsg(`appt:keep:${APPT}`)));
    expect((h.graph.sent.at(-1)!.payload as any).text.body).toBe('Great, see you then!');
    await h.webhook(inbound(templateButtonMsg(`appt:cancel:${APPT}`)));
    expect(h.repo.db.conversations[0]!.state).toBe('cancel_confirm');
  });
});

describe('conversation expiry job', () => {
  it('closes mid-flow conversations past their window and abandons attempts', async () => {
    const h = appHarness();
    await h.webhook(inbound(buttonMsg('menu:book')));
    h.clock.now = new Date(NOW.getTime() + 25 * 3600_000);
    expect(await runConversationExpiry(h.deps)).toEqual({ expired: 1, attempts_abandoned: 1, conflicts: 0 });
    expect(h.repo.db.conversations[0]).toMatchObject({ state: 'closed', context: {}, invalid_input_count: 0 });
    expect(h.repo.db.attempts[0]!.outcome).toBe('abandoned');
    // Running again finds nothing.
    expect(await runConversationExpiry(h.deps)).toEqual({ expired: 0, attempts_abandoned: 0, conflicts: 0 });
  });

  it('leaves escalated and still-open conversations alone', async () => {
    const h = appHarness();
    await h.webhook(inbound(buttonMsg('menu:help')));
    h.clock.now = new Date(NOW.getTime() + 25 * 3600_000);
    expect((await runConversationExpiry(h.deps)).expired).toBe(0);
    const fresh = appHarness();
    await fresh.webhook(inbound(buttonMsg('menu:book')));
    expect((await runConversationExpiry(fresh.deps)).expired).toBe(0);
  });
});

describe('WABA health job', () => {
  it('refreshes phone quality, limits and template statuses', async () => {
    const h = harness();
    h.repo.db.templates.push({
      id: 't1',
      business_id: BIZ,
      whatsapp_account_id: h.repo.db.accounts[0]!.id,
      name: 'booking_reminder',
      language: 'en',
      category: 'utility',
      meta_template_id: 'm1',
      status: 'submitted',
      rejection_reason: null,
    });
    h.graph.templates.push({ id: 'm1', name: 'booking_reminder', language: 'en', status: 'APPROVED' });
    h.repo.db.accounts[0]!.quality_rating = null;
    expect(await runWabaHealth(h.deps)).toEqual({ checked: 1, healthy: 1, needs_reauth: 0, failed: 0 });
    expect(h.repo.db.accounts[0]).toMatchObject({ quality_rating: 'GREEN', messaging_limit: 'TIER_1K', last_health_check_at: NOW.toISOString(), last_error: null });
    expect(h.repo.db.templates[0]!.status).toBe('approved');
  });

  it('marks needs_reauth on error 190 and recovers when the token works again', async () => {
    const h = harness();
    const graph = h.graph.factory;
    let broken = true;
    h.deps.graph = (token) => ({
      ...graph(token),
      getPhoneNumber: async (id) => {
        if (broken) throw new GraphError({ message: 'Session has expired', status: 401, code: 190 });
        return graph(token).getPhoneNumber(id);
      },
    });
    expect(await runWabaHealth(h.deps)).toMatchObject({ needs_reauth: 1 });
    expect(h.repo.db.accounts[0]!.status).toBe('needs_reauth');
    broken = false;
    expect(await runWabaHealth(h.deps)).toMatchObject({ healthy: 1 });
    expect(h.repo.db.accounts[0]!.status).toBe('live');
  });

  it('records other failures without changing status', async () => {
    const h = harness();
    const graph = h.graph.factory;
    h.deps.graph = (token) => ({
      ...graph(token),
      getPhoneNumber: async () => {
        throw new GraphError({ message: 'Service unavailable', status: 503 });
      },
    });
    expect(await runWabaHealth(h.deps)).toMatchObject({ failed: 1 });
    expect(h.repo.db.accounts[0]).toMatchObject({ status: 'live', last_error: 'health: other: Service unavailable' });
  });

  it('skips disconnected accounts', async () => {
    const h = harness({ account: { status: 'disconnected' } });
    expect(await runWabaHealth(h.deps)).toMatchObject({ checked: 0 });
  });
});

describe('token refresh job', () => {
  it('exchanges tokens that expire within 7 days', async () => {
    const h = harness({ account: { token_expires_at: new Date(NOW.getTime() + 3 * 86400_000).toISOString() } });
    expect(await runTokenRefresh(h.deps)).toEqual({ checked: 1, refreshed: 1, needs_reauth: 0, failed: 0 });
    const account = h.repo.db.accounts[0]!;
    expect(decryptSecret(account.access_token_ciphertext!, h.deps.env.TOKEN_ENCRYPTION_KEY!)).toBe('EAAG-long-lived');
    expect(account.token_expires_at).toBe(new Date(NOW.getTime() + 60 * 86400_000).toISOString());
    expect(h.graph.calls[0]!.args[0]).toMatchObject({ token: 'EAAG-test-token' });
  });

  it('leaves non-expiring (system-user) and far-off tokens alone', async () => {
    const h = harness();
    expect(await runTokenRefresh(h.deps)).toMatchObject({ checked: 0 });
    const later = harness({ account: { token_expires_at: new Date(NOW.getTime() + 30 * 86400_000).toISOString() } });
    expect(await runTokenRefresh(later.deps)).toMatchObject({ checked: 0 });
  });

  it('flags already-expired or unreadable tokens as needs_reauth', async () => {
    const h = harness({ account: { token_expires_at: new Date(NOW.getTime() - 1000).toISOString() } });
    expect(await runTokenRefresh(h.deps)).toMatchObject({ needs_reauth: 1 });
    expect(h.repo.db.accounts[0]!.status).toBe('needs_reauth');

    const bad = harness({
      account: {
        token_expires_at: new Date(NOW.getTime() + 86400_000).toISOString(),
        access_token_ciphertext: encryptSecret('x', Buffer.alloc(32, 1).toString('base64')),
      },
    });
    expect(await runTokenRefresh(bad.deps)).toMatchObject({ needs_reauth: 1 });
  });

  it('does nothing without Meta app credentials', async () => {
    const h = harness({ account: { token_expires_at: new Date(NOW.getTime() + 86400_000).toISOString() } });
    h.deps.env = { ...h.deps.env, META_APP_SECRET: undefined };
    expect(await runTokenRefresh(h.deps)).toEqual({ checked: 0, refreshed: 0, needs_reauth: 0, failed: 0 });
  });
});

describe('cron routes', () => {
  it.each(['reminders', 'conversation-expiry', 'waba-health', 'token-refresh'])('runs %s behind the cron secret', async (job) => {
    const h = appHarness();
    expect((await h.call('POST', `/cron/${job}`, { token: null, key: null })).status).toBe(401);
    const r = await h.call('POST', `/cron/${job}`, { token: null, key: null, headers: { 'x-cron-secret': 'cron-secret' } });
    expect(r.status).toBe(200);
    expect(r.body.data.job).toBe(job);
    expect(Object.values(r.body.data.result).every((v) => typeof v === 'number')).toBe(true);
  });
});
