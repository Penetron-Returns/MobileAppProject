import { describe, expect, it } from 'vitest';

import { GraphError } from '@booking/app-store/whatsapp/graph.ts';
import { buttonMsg, inbound, NOW, sentIds, sentText, textMsg } from '@booking/testing/whatsapp/index.ts';
import { appHarness } from './appHarness.ts';

/** A thread where the customer messaged at `NOW` and is mid-booking. */
async function thread(opts: { account?: NonNullable<Parameters<typeof appHarness>[0]>['account'] } = {}) {
  const h = appHarness({ account: opts.account });
  await h.webhook(inbound(buttonMsg('menu:book')));
  const conv = h.repo.db.conversations[0]!;
  return { h, conv };
}

describe('inbox: staff reply', () => {
  it('sends inside the window, stores sent_by, takes the thread over and abandons the attempt', async () => {
    const { h, conv } = await thread();
    expect(conv.state).toBe('select_service');
    const r = await h.call('POST', `/v1/conversations/${conv.id}/messages`, { token: 'staff', body: { text: 'Hi, this is Sam' } });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ conversation_state: 'escalated', wa_message_id: expect.stringMatching(/^wamid\.out\./) });
    expect(sentText(h.graph)).toBe('Hi, this is Sam');
    expect(h.repo.db.messages.at(-1)).toMatchObject({ direction: 'out', sent_by: 'user_staff', status: 'sent', type: 'text' });
    expect(h.repo.db.conversations[0]).toMatchObject({ state: 'escalated', context: { ackSent: true } });
    expect(h.repo.db.attempts[0]!.outcome).toBe('abandoned');

    // The bot now stays silent.
    const before = h.graph.sent.length;
    await h.webhook(inbound(textMsg()));
    expect(h.graph.sent).toHaveLength(before);
  });

  it('refuses with WINDOW_CLOSED outside the 24h window', async () => {
    const { h, conv } = await thread();
    h.clock.now = new Date(NOW.getTime() + 24 * 3600_000 + 1);
    const r = await h.call('POST', `/v1/conversations/${conv.id}/messages`, { body: { text: 'Hello?' } });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('WINDOW_CLOSED');
    expect(h.repo.db.conversations[0]!.state).toBe('select_service');
  });

  it('maps a Meta 131047 (window closed) to WINDOW_CLOSED and other failures to 502', async () => {
    const { h, conv } = await thread();
    h.graph.failNext(new GraphError({ message: 'Re-engagement message', status: 400, code: 131047 }));
    expect((await h.call('POST', `/v1/conversations/${conv.id}/messages`, { body: { text: 'a' } })).body.error.code).toBe('WINDOW_CLOSED');
    h.graph.failNext(new GraphError({ message: 'Bad', status: 400, code: 131009 }));
    const r = await h.call('POST', `/v1/conversations/${conv.id}/messages`, { body: { text: 'b' } });
    expect(r.status).toBe(502);
    expect(h.repo.db.messages.filter((m) => m.status === 'failed')).toHaveLength(2);
  });

  it('lets staff reply while the bot is paused', async () => {
    const { h, conv } = await thread();
    h.repo.db.accounts[0]!.status = 'paused';
    expect((await h.call('POST', `/v1/conversations/${conv.id}/messages`, { body: { text: 'hi' } })).status).toBe(201);
  });

  it('refuses when the channel is disconnected', async () => {
    const { h, conv } = await thread();
    h.repo.db.accounts[0]!.status = 'disconnected';
    const r = await h.call('POST', `/v1/conversations/${conv.id}/messages`, { body: { text: 'hi' } });
    expect(r.status).toBe(422);
    expect(r.body.error.details).toEqual({ rule: 'CHANNEL_NOT_CONNECTED' });
  });

  it('404s a conversation of another business and validates input', async () => {
    const { h, conv } = await thread();
    conv.business_id = '00000000-0000-4000-8000-000000000999';
    h.repo.db.conversations[0]!.business_id = conv.business_id;
    expect((await h.call('POST', `/v1/conversations/${conv.id}/messages`, { body: { text: 'hi' } })).status).toBe(404);
    expect((await h.call('POST', `/v1/conversations/not-a-uuid/messages`, { body: { text: 'hi' } })).status).toBe(400);
    expect((await h.call('POST', `/v1/conversations/${conv.id}/messages`, { body: { text: '   ' } })).status).toBe(400);
  });
});

describe('inbox: release', () => {
  it('resolves open escalations and sends the menu inside the window', async () => {
    const { h, conv } = await thread();
    await h.webhook(inbound(buttonMsg('menu:help')));
    expect(h.repo.db.escalations).toMatchObject([{ status: 'open', reason: 'customer_requested' }]);

    const r = await h.call('POST', `/v1/conversations/${conv.id}/release`, { token: 'staff' });
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ conversation_id: conv.id, state: 'menu', escalations_resolved: 1 });
    expect(h.repo.db.escalations[0]).toMatchObject({ status: 'resolved', resolved_by: 'user_staff', resolved_at: NOW.toISOString() });
    expect(sentIds(h.graph)).toEqual(['menu:book', 'menu:bookings', 'menu:help']);
    expect(h.repo.db.conversations[0]).toMatchObject({ state: 'menu', context: {}, invalid_input_count: 0 });

    // The bot answers again.
    await h.webhook(inbound(buttonMsg('menu:book')));
    expect(h.repo.db.conversations[0]!.state).toBe('select_service');
  });

  it('goes to idle without sending when the window has closed', async () => {
    const { h, conv } = await thread();
    h.clock.now = new Date(NOW.getTime() + 25 * 3600_000);
    const sent = h.graph.sent.length;
    const r = await h.call('POST', `/v1/conversations/${conv.id}/release`);
    expect(r.body.data.state).toBe('idle');
    expect(h.graph.sent).toHaveLength(sent);
    expect(h.repo.db.attempts[0]!.outcome).toBe('abandoned');
  });
});

describe('inbox: resolve escalation', () => {
  it('resolves with a note, idempotently', async () => {
    const { h } = await thread();
    await h.webhook(inbound(buttonMsg('menu:help')));
    const esc = h.repo.db.escalations[0]!;
    const r = await h.call('POST', `/v1/escalations/${esc.id}/resolve`, { body: { note: 'Called back' } });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ id: esc.id, status: 'resolved', note: 'Called back', resolved_by: 'user_owner' });
    const again = await h.call('POST', `/v1/escalations/${esc.id}/resolve`, { raw: '' });
    expect(again.body.data).toMatchObject({ status: 'resolved', note: 'Called back' });
  });

  it('404s an unknown escalation', async () => {
    const { h } = await thread();
    expect((await h.call('POST', `/v1/escalations/00000000-0000-4000-8000-000000000999/resolve`, { body: {} })).status).toBe(404);
  });
});
