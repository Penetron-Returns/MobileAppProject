import { describe, expect, it } from 'vitest';


import { signMetaBody, verifyMetaSignature } from '@booking/app-store/whatsapp/signature.ts';
import { extractEvents, WebhookPayload } from '@booking/app-store/whatsapp/webhook/events.ts';
import {
  ACCOUNT_ID,
  buttonMsg,
  CUSTOMER_PHONE,
  fieldPayload,
  inbound,
  nextWamid,
  NOW,
  sentIds,
  sentText,
  statusPayload,
  textMsg,
  WABA_ID,
} from '@booking/testing/whatsapp/index.ts';
import { appHarness } from './appHarness.ts';

describe('webhook: verification handshake', () => {
  it('echoes the challenge for the right verify token', async () => {
    const h = appHarness();
    const r = await h.call('GET', '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345', { token: null });
    expect(r.status).toBe(200);
    expect(r.text).toBe('12345');
  });

  it.each([
    ['wrong token', 'hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1'],
    ['wrong mode', 'hub.mode=unsubscribe&hub.verify_token=verify-me&hub.challenge=1'],
    ['missing token', 'hub.mode=subscribe&hub.challenge=1'],
  ])('rejects %s with 403', async (_label, query) => {
    const h = appHarness();
    expect((await h.call('GET', `/webhooks/whatsapp?${query}`, { token: null })).status).toBe(403);
  });
});

describe('webhook: signature', () => {
  it('verifies X-Hub-Signature-256 over the raw body', () => {
    const raw = '{"a":1}';
    expect(verifyMetaSignature('s3cret', raw, signMetaBody('s3cret', raw))).toBe(true);
    expect(verifyMetaSignature('s3cret', '{"a":2}', signMetaBody('s3cret', raw))).toBe(false);
    expect(verifyMetaSignature('s3cret', raw, 'sha1=abc')).toBe(false);
    expect(verifyMetaSignature(undefined, raw, signMetaBody('s3cret', raw))).toBe(false);
  });

  it('answers 401 with the error envelope and stores nothing for a bad signature', async () => {
    const h = appHarness();
    const r = await h.webhook(inbound(textMsg()), 'sha256=deadbeef');
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('UNAUTHENTICATED');
    expect(h.repo.db.webhookEvents).toHaveLength(0);
    expect(h.repo.db.messages).toHaveLength(0);
  });

  it('acknowledges an authentic but unparseable payload with 200', async () => {
    const h = appHarness();
    expect((await h.webhook({ hello: 'world' })).status).toBe(200);
    expect(h.graph.sent).toHaveLength(0);
  });
});

describe('webhook: inbound messages', () => {
  it('upserts the client, stores the message, marks it read and replies with the menu', async () => {
    const h = appHarness();
    const r = await h.webhook(inbound(textMsg('wamid.A1')));
    expect(r.status).toBe(200);
    expect(h.repo.db.clients).toMatchObject([{ phone_e164: CUSTOMER_PHONE, name: 'Thandi' }]);
    expect(h.repo.db.messages[0]).toMatchObject({ direction: 'in', wa_message_id: 'wamid.A1', type: 'text', status: 'received' });
    expect(h.graph.calls.some((c) => c.method === 'markAsRead')).toBe(true);
    expect(sentIds(h.graph)).toEqual(['menu:book', 'menu:bookings', 'menu:help']);
    const out = h.repo.db.messages.filter((m) => m.direction === 'out');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ status: 'sent', type: 'interactive', wa_message_id: 'wamid.out.1' });
    expect(h.repo.db.webhookEvents).toMatchObject([{ event_key: 'msg:wamid.A1', error: null, whatsapp_account_id: ACCOUNT_ID }]);
    expect(h.repo.db.webhookEvents[0]!.processed_at).toBe(NOW.toISOString());
  });

  it('stores only a minimal, PII-free payload in webhook_events', async () => {
    const h = appHarness();
    await h.webhook(inbound(textMsg('wamid.PII', 'my secret text')));
    const stored = JSON.stringify(h.repo.db.webhookEvents[0]!.payload);
    expect(stored).not.toContain('my secret text');
    expect(stored).not.toContain('Thandi');
    expect(stored).not.toContain('27821234567');
  });

  it('sets the 24h window from the inbound timestamp', async () => {
    const h = appHarness();
    await h.webhook(inbound(textMsg()));
    const conv = h.repo.db.conversations[0]!;
    expect(conv.last_inbound_at).toBe(NOW.toISOString());
    expect(conv.window_expires_at).toBe(new Date(NOW.getTime() + 24 * 3600_000).toISOString());
  });

  it('processes a message delivered twice only once', async () => {
    const h = appHarness();
    const payload = inbound(textMsg('wamid.DUP'));
    await h.webhook(payload);
    await h.webhook(payload);
    expect(h.graph.sent).toHaveLength(1);
    expect(h.repo.db.messages.filter((m) => m.direction === 'in')).toHaveLength(1);
    expect(h.repo.db.webhookEvents).toHaveLength(1);
  });

  it('retries an event that was recorded but never finished', async () => {
    const h = appHarness();
    h.repo.db.webhookEvents.push({
      id: 'evt-1',
      event_key: 'msg:wamid.RETRY',
      whatsapp_account_id: ACCOUNT_ID,
      payload: {},
      processed_at: null,
      error: null,
      attempts: 1,
    });
    await h.webhook(inbound(textMsg('wamid.RETRY')));
    expect(h.repo.db.webhookEvents[0]).toMatchObject({ attempts: 2, processed_at: NOW.toISOString() });
    expect(h.graph.sent).toHaveLength(1);
  });

  it('records messages to an unlinked number without replying', async () => {
    const h = appHarness({ account: null });
    const r = await h.webhook(inbound(textMsg('wamid.U1')));
    expect(r.status).toBe(200);
    expect(h.graph.sent).toHaveLength(0);
    expect(h.repo.db.clients).toHaveLength(0);
    expect(h.repo.db.webhookEvents).toMatchObject([{ event_key: 'msg:wamid.U1', error: 'unlinked_number', whatsapp_account_id: null }]);
  });

  it.each(['paused', 'disconnected', 'needs_reauth', 'pending'] as const)('flags a %s account for staff and stays silent', async (status) => {
    const h = appHarness({ account: { status } });
    await h.webhook(inbound(textMsg()));
    expect(h.graph.sent).toHaveLength(0);
    expect(h.repo.db.messages.filter((m) => m.direction === 'in')).toHaveLength(1);
    expect(h.repo.db.escalations).toMatchObject([{ reason: 'unlinked_number', status: 'open', note: `channel_${status}` }]);
    expect(h.pushes).toHaveLength(1);
    expect(h.repo.db.webhookEvents[0]!.error).toBe(`account_${status}`);
  });

  it('stores reactions without running the engine', async () => {
    const h = appHarness();
    const id = nextWamid();
    await h.webhook(inbound({ id, from: '27821234567', timestamp: '1790000000', type: 'reaction', reaction: { message_id: 'x', emoji: '👍' } }));
    expect(h.repo.db.messages).toMatchObject([{ type: 'reaction', wa_message_id: id }]);
    expect(h.graph.sent).toHaveLength(0);
  });

  it('keeps going after a per-event failure and records the error', async () => {
    const h = appHarness();
    h.booking.getBusiness = async () => {
      throw new Error('boom');
    };
    const r = await h.webhook(inbound(buttonMsg('menu:book')));
    expect(r.status).toBe(200);
    expect(h.repo.db.webhookEvents[0]!.error).toMatch(/^exception: boom/);
  });

  it('answers 500 when events cannot be recorded, so Meta redelivers', async () => {
    const h = appHarness();
    h.repo.recordWebhookEvent = async () => {
      throw new Error('db down');
    };
    expect((await h.webhook(inbound(textMsg()))).status).toBe(500);
  });
});

describe('webhook: statuses', () => {
  async function withOutbound() {
    const h = appHarness();
    await h.webhook(inbound(textMsg()));
    return h;
  }

  it('moves message status forward only', async () => {
    const h = await withOutbound();
    await h.webhook(statusPayload('wamid.out.1', 'read'));
    await h.webhook(statusPayload('wamid.out.1', 'delivered'));
    const out = h.repo.db.messages.find((m) => m.wa_message_id === 'wamid.out.1')!;
    expect(out.status).toBe('read');
    expect(out.read_at).toBe(NOW.toISOString());
    expect(out.delivered_at).toBe(NOW.toISOString());
  });

  it('escalates delivery_failed when a booking-critical message fails', async () => {
    const h = await withOutbound();
    h.repo.db.messages.find((m) => m.wa_message_id === 'wamid.out.1')!.body.critical = true;
    await h.webhook(statusPayload('wamid.out.1', 'failed', [{ code: 131026, title: 'Message undeliverable' }]));
    const out = h.repo.db.messages.find((m) => m.wa_message_id === 'wamid.out.1')!;
    expect(out.status).toBe('failed');
    expect(out.error).toEqual({ code: 131026, title: 'Message undeliverable' });
    expect(h.repo.db.escalations).toMatchObject([{ reason: 'delivery_failed' }]);
  });

  it('does not escalate a failed non-critical message', async () => {
    const h = await withOutbound();
    await h.webhook(statusPayload('wamid.out.1', 'failed', [{ code: 131047, title: 'Re-engagement message' }]));
    expect(h.repo.db.escalations).toHaveLength(0);
  });

  it('notes statuses for unknown messages', async () => {
    const h = appHarness();
    await h.webhook(statusPayload('wamid.nope', 'delivered'));
    expect(h.repo.db.webhookEvents[0]!.error).toBe('message_not_found');
  });

  it('dedupes each status per message', async () => {
    const payload = statusPayload('wamid.x', 'sent');
    const events = extractEvents(WebhookPayload.parse(payload));
    expect(events.map((e) => e.key)).toEqual(['status:wamid.x:sent']);
  });
});

describe('webhook: account-level events', () => {
  it.each([
    ['APPROVED', 'approved', null],
    ['REJECTED', 'rejected', 'INVALID_FORMAT'],
    ['PAUSED', 'paused', null],
    ['DISABLED', 'disabled', null],
  ] as const)('template %s → %s', async (event, status, reason) => {
    const h = appHarness();
    h.repo.db.templates.push({
      id: 't1',
      business_id: 'b',
      whatsapp_account_id: ACCOUNT_ID,
      name: 'booking_confirmation',
      language: 'en',
      category: 'utility',
      meta_template_id: '555',
      status: 'submitted',
      rejection_reason: null,
    });
    await h.webhook(
      fieldPayload('message_template_status_update', {
        event,
        message_template_id: 555,
        message_template_name: 'booking_confirmation',
        message_template_language: 'en',
        reason: reason ?? 'NONE',
      }),
    );
    expect(h.repo.db.templates[0]).toMatchObject({ status, rejection_reason: reason });
  });

  it('matches a template by name when Meta ids are not stored yet', async () => {
    const h = appHarness();
    h.repo.db.templates.push({
      id: 't1',
      business_id: 'b',
      whatsapp_account_id: ACCOUNT_ID,
      name: 'booking_reminder',
      language: 'en',
      category: 'utility',
      meta_template_id: null,
      status: 'submitted',
      rejection_reason: null,
    });
    await h.webhook(
      fieldPayload('message_template_status_update', {
        event: 'APPROVED',
        message_template_id: '777',
        message_template_name: 'booking_reminder',
        message_template_language: 'en',
      }),
    );
    expect(h.repo.db.templates[0]).toMatchObject({ status: 'approved', meta_template_id: '777' });
  });

  it('updates quality rating and messaging limit', async () => {
    const h = appHarness();
    await h.webhook(fieldPayload('phone_number_quality_update', { event: 'FLAGGED', display_phone_number: '+27 82 000 0000', current_limit: 'TIER_250' }));
    expect(h.repo.db.accounts[0]).toMatchObject({ quality_rating: 'RED', messaging_limit: 'TIER_250' });
  });

  it('flags account bans and disconnects when the partner is removed', async () => {
    const h = appHarness();
    await h.webhook(fieldPayload('account_update', { event: 'DISABLED_UPDATE' }));
    expect(h.repo.db.accounts[0]).toMatchObject({ status: 'live', last_error: 'account_update:DISABLED_UPDATE' });
    await h.webhook(fieldPayload('account_update', { event: 'PARTNER_REMOVED' }, 1790000001));
    expect(h.repo.db.accounts[0]).toMatchObject({ status: 'disconnected' });
  });

  it('ignores unknown fields but records them', async () => {
    const h = appHarness();
    await h.webhook(fieldPayload('security', { event: 'x' }));
    expect(h.repo.db.webhookEvents[0]).toMatchObject({ error: 'ignored_field:security' });
    expect(h.repo.db.webhookEvents[0]!.event_key).toMatch(/^other:security:/);
  });

  it('gives template events stable keys for dedupe', () => {
    const payload = WebhookPayload.parse(fieldPayload('message_template_status_update', { event: 'APPROVED', message_template_id: 9 }));
    expect(extractEvents(payload).map((e) => e.key)).toEqual([`tpl:9:APPROVED:1790000000`]);
    expect(WABA_ID).toBe(payload.entry[0]!.id);
  });
});

describe('webhook: inbound input kinds', () => {
  it('maps every message type to an engine input', async () => {
    const h = appHarness();
    await h.webhook(inbound({ id: nextWamid(), from: '27821234567', timestamp: '1790000000', type: 'image', image: { id: 'm' } }));
    // Unsupported input on idle shows the menu, like any other message.
    expect(sentText(h.graph)).toContain('What would you like to do?');
    expect(h.repo.db.messages[0]).toMatchObject({ type: 'media', body: { media_type: 'image' } });
  });
});
