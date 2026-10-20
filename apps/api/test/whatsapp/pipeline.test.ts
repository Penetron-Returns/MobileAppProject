/** Inbound pipeline: persistence rules around the pure transition. */
import { describe, expect, it } from 'vitest';

import { handleInboundMessage } from '@booking/app-store/whatsapp/engine/index.ts';
import { COPY } from '@booking/app-store/whatsapp/engine/copy.ts';
import { toInbound } from '@booking/app-store/whatsapp/webhook/events.ts';
import {
  appointment,
  buttonMsg,
  CUSTOMER_PHONE,
  harness,
  liveAccount,
  listMsg,
  NOW,
  sentIds,
  sentText,
  SVC_CUT,
  textMsg,
} from '@booking/testing/whatsapp/index.ts';

const run = (h: ReturnType<typeof harness>, message: Record<string, unknown>) =>
  handleInboundMessage(h.deps, liveAccount(), toInbound(message as never, 'Thandi'));

describe('inbound pipeline', () => {
  it('re-runs the transition on a version conflict (compare-and-set)', async () => {
    const h = harness();
    await run(h, textMsg());
    h.repo.db.conflictOnce = true;
    expect(await run(h, buttonMsg('menu:book'))).toBe('processed');
    const conv = h.repo.db.conversations[0]!;
    expect(conv.state).toBe('select_service');
    // v1 after the menu, +1 by the "other writer", +1 by the re-run.
    expect(conv.version).toBe(3);
    // Side effects ran once, after the successful save.
    expect(h.repo.db.attempts).toHaveLength(1);
  });

  it('never moves the window backwards for a late, out-of-order message', async () => {
    const h = harness();
    await run(h, textMsg(undefined, 'hi', NOW));
    await run(h, textMsg(undefined, 'hi', new Date(NOW.getTime() - 3600_000)));
    expect(h.repo.db.conversations[0]!.last_inbound_at).toBe(NOW.toISOString());
  });

  it('does not trust a timestamp from the future', async () => {
    const h = harness();
    await run(h, textMsg(undefined, 'hi', new Date(NOW.getTime() + 86400_000)));
    expect(h.repo.db.conversations[0]!.window_expires_at).toBe(new Date(NOW.getTime() + 86400_000).toISOString());
  });

  it('fills the client name from the WhatsApp profile only when blank', async () => {
    const h = harness();
    await run(h, textMsg());
    expect(h.repo.db.clients[0]).toMatchObject({ phone_e164: CUSTOMER_PHONE, name: 'Thandi' });
  });

  it('sends a blocked client one fixed notice per 24h and never starts a booking', async () => {
    const h = harness();
    await run(h, textMsg());
    h.repo.db.clients[0]!.is_blocked = true;
    const before = h.graph.sent.length;
    await run(h, buttonMsg('menu:book'));
    await run(h, buttonMsg('menu:book'));
    expect(h.graph.sent.length - before).toBe(1);
    expect(sentText(h.graph)).toBe(COPY.blocked);
    expect(h.repo.db.attempts).toHaveLength(0);
  });

  it('acknowledges once when escalated, then stays silent until released', async () => {
    const h = harness();
    await run(h, textMsg());
    await run(h, buttonMsg('menu:help'));
    expect(sentText(h.graph)).toBe(COPY.helpEscalated);
    const before = h.graph.sent.length;
    await run(h, textMsg());
    await run(h, buttonMsg('menu:book'));
    expect(h.graph.sent).toHaveLength(before);
  });

  it('pushes staff about an escalation without customer details', async () => {
    const h = harness();
    await run(h, buttonMsg('menu:help'));
    expect(h.pushes).toEqual([{ businessId: h.world.business.id, title: 'Customer needs attention', body: 'A customer asked to talk to someone.' }]);
  });

  it('ignores a double tap while a booking is being written', async () => {
    const h = harness();
    await run(h, buttonMsg('menu:book'));
    await run(h, listMsg(`svc:${SVC_CUT}`));
    await run(h, listMsg('stf:any'));
    await run(h, listMsg('day:2026-09-29'));
    await run(h, listMsg('slot:2026-09-29T07:00:00.000Z|any'));
    // Simulate a request still in flight.
    const conv = h.repo.db.conversations[0]!;
    conv.context = { ...conv.context, busySince: NOW.toISOString() };
    await run(h, buttonMsg('cfm:yes'));
    expect(sentText(h.graph)).toBe(COPY.busy);
    expect(h.world.appointments).toHaveLength(0);
  });

  it('opens an appointment from a reminder quick reply in any state', async () => {
    const h = harness();
    await run(h, buttonMsg('menu:book'));
    const client = h.repo.db.clients[0]!;
    const appt = appointment({ id: '00000000-0000-4000-8000-00000000aaaa', client_id: client.id, starts_at: '2026-10-05T07:00:00.000Z' });
    h.world.appointments.push(appt);
    await run(h, { id: 'wamid.tpl', from: '27821234567', timestamp: '1790000000', type: 'button', button: { payload: `appt:${appt.id}`, text: 'Manage booking' } });
    expect(sentIds(h.graph)).toEqual([`appt:resched:${appt.id}`, `appt:cancel:${appt.id}`, 'nav:back']);
    expect(h.repo.db.attempts[0]!.outcome).toBe('abandoned');
  });
});
