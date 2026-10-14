import { describe, expect, it } from 'vitest';

import { createNotificationService, notifyAppointmentChanged } from '@booking/app-store/whatsapp/notifications/index.ts';
import { createPushSender, EXPO_PUSH_URL } from '@booking/app-store/whatsapp/notifications/push.ts';
import type { Db } from '@booking/features/lib/db.ts';
import type { AppointmentChangedEvent } from '@booking/features/ports.ts';
import { GraphError } from '@booking/app-store/whatsapp/graph.ts';
import {
  appointment,
  BIZ,
  CUSTOMER_PHONE,
  harness,
  NOW,
  silentLogger,
  type Harness,
} from '@booking/testing/whatsapp/index.ts';

const APPT = '00000000-0000-4000-8000-00000000aaaa';

async function setup(opts: { windowOpen?: boolean; startsAt?: string } = {}) {
  const h = harness();
  const client = await h.repo.upsertClientByPhone(BIZ, CUSTOMER_PHONE, 'Thandi');
  const conv = await h.repo.getOrCreateConversation(BIZ, client.id);
  if (opts.windowOpen) {
    h.repo.db.conversations[0]!.window_expires_at = new Date(NOW.getTime() + 3600_000).toISOString();
  }
  h.world.appointments.push(appointment({ id: APPT, client_id: client.id, starts_at: opts.startsAt ?? '2026-09-30T07:00:00.000Z' }));
  return { h, client, conv };
}

const event = (over: Partial<AppointmentChangedEvent> = {}): AppointmentChangedEvent => ({
  businessId: BIZ,
  appointmentId: APPT,
  kind: 'created',
  actor: { type: 'staff', id: 'user_owner' },
  notifyCustomer: true,
  ...over,
});

const lastPayload = (h: Harness) => h.graph.sent.at(-1)?.payload as any;

describe('NotificationService: customer message', () => {
  it('sends an interactive session message inside the 24h window', async () => {
    const { h } = await setup({ windowOpen: true });
    expect(await notifyAppointmentChanged(h.deps, event())).toBe('sent');
    const p = lastPayload(h);
    expect(p.type).toBe('interactive');
    expect(p.interactive.body.text).toContain("You're booked!");
    expect(p.interactive.body.text).toContain('Date: Wed 30 Sep 2026');
    expect(p.interactive.action.buttons[0].reply.id).toBe(`appt:${APPT}`);
  });

  it.each([
    ['created', 'booking_confirmation', `appt:${APPT}`],
    ['rescheduled', 'booking_rescheduled', `appt:${APPT}`],
    ['cancelled', 'booking_cancelled', 'menu:book'],
  ] as const)('uses the %s template outside the window', async (kind, name, payload) => {
    const { h } = await setup();
    expect(await notifyAppointmentChanged(h.deps, event({ kind }))).toBe('sent');
    const p = lastPayload(h);
    expect(p.template.name).toBe(name);
    expect(p.template.components).toEqual([
      {
        type: 'body',
        parameters: ['Nadia Hair', 'Haircut', 'Wed 30 Sep 2026 at 09:00', 'Sam'].map((text) => ({ type: 'text', text })),
      },
      { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload }] },
    ]);
  });

  it('records the message and a confirmation_sent event, once per change', async () => {
    const { h } = await setup();
    await notifyAppointmentChanged(h.deps, event());
    expect(await notifyAppointmentChanged(h.deps, event())).toBe('skipped');
    expect(h.graph.sent).toHaveLength(1);
    const msg = h.repo.db.messages[0]!;
    expect(msg).toMatchObject({ direction: 'out', type: 'template', status: 'sent', body: { template: 'booking_confirmation', critical: true } });
    expect(h.repo.db.appointmentEvents).toEqual([
      { appointment_id: APPT, type: 'confirmation_sent', payload: { kind: 'created', channel: 'template', message_id: msg.id } },
    ]);
  });

  it('sends a new confirmation for each reschedule', async () => {
    const { h } = await setup();
    await notifyAppointmentChanged(h.deps, event({ kind: 'rescheduled' }));
    h.world.appointments[0]!.starts_at = '2026-10-01T07:00:00.000Z';
    await notifyAppointmentChanged(h.deps, event({ kind: 'rescheduled' }));
    expect(h.graph.sent).toHaveLength(2);
  });

  it.each([
    ['notifyCustomer is false', (_h: Harness) => {}, { notifyCustomer: false }],
    ['the client opted out', (h: Harness) => (h.repo.db.clients[0]!.whatsapp_opt_in = false), {}],
    ['the client is blocked', (h: Harness) => (h.repo.db.clients[0]!.is_blocked = true), {}],
    ['the channel is paused', (h: Harness) => (h.repo.db.accounts[0]!.status = 'paused'), {}],
    ['the appointment is unknown', (h: Harness) => h.world.appointments.splice(0), {}],
  ])('skips when %s', async (_label, arrange, over) => {
    const { h } = await setup();
    arrange(h);
    expect(await notifyAppointmentChanged(h.deps, event(over))).toBe('skipped');
    expect(h.graph.sent).toHaveLength(0);
  });

  it('escalates delivery_failed and never throws when Meta fails', async () => {
    const { h } = await setup();
    h.graph.failNext(new GraphError({ message: 'Undeliverable', status: 400, code: 131026 }));
    const service = createNotificationService({ env: h.deps.env, db: {} as Db, overrides: h.deps });
    await expect(service.appointmentChanged(event())).resolves.toBeUndefined();
    expect(h.repo.db.escalations).toMatchObject([{ reason: 'delivery_failed' }]);
    expect(h.repo.db.messages[0]).toMatchObject({ status: 'failed', error: { kind: 'undeliverable', code: 131026 } });
    expect(h.repo.db.appointmentEvents).toHaveLength(0);
  });

  it('swallows repository failures', async () => {
    const { h } = await setup();
    h.repo.getAppointmentBrief = async () => {
      throw new Error('db down');
    };
    const service = createNotificationService({ env: h.deps.env, db: {} as Db, overrides: h.deps });
    await expect(service.appointmentChanged(event())).resolves.toBeUndefined();
  });
});

describe('NotificationService: staff push', () => {
  it.each([
    ['created', 'New booking'],
    ['rescheduled', 'Booking moved'],
    ['cancelled', 'Booking cancelled'],
  ] as const)('pushes %s by a customer without PII', async (kind, title) => {
    const { h } = await setup();
    await notifyAppointmentChanged(h.deps, event({ kind, actor: { type: 'customer', id: 'c' }, notifyCustomer: false }));
    expect(h.pushes).toEqual([{ businessId: BIZ, title, body: 'Haircut, Wed 30 Sep 2026 at 09:00' }]);
  });

  it('does not push changes made by staff', async () => {
    const { h } = await setup();
    await notifyAppointmentChanged(h.deps, event({ notifyCustomer: false }));
    expect(h.pushes).toHaveLength(0);
  });
});

describe('Expo push sender', () => {
  it('batches valid Expo tokens and never throws', async () => {
    const calls: { url: string; body: any[] }[] = [];
    const push = createPushSender({
      listTokens: async () => ['ExponentPushToken[abc]', 'not-a-token', 'ExpoPushToken[def]'],
      accessToken: 'expo-token',
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch,
      logger: silentLogger,
    });
    expect(await push.toBusiness(BIZ, { title: 't', body: 'b', data: { type: 'x' } })).toBe(2);
    expect(calls).toEqual([
      {
        url: EXPO_PUSH_URL,
        body: [
          { to: 'ExponentPushToken[abc]', sound: 'default', title: 't', body: 'b', data: { type: 'x' } },
          { to: 'ExpoPushToken[def]', sound: 'default', title: 't', body: 'b', data: { type: 'x' } },
        ],
      },
    ]);

    const broken = createPushSender({
      listTokens: async () => {
        throw new Error('db');
      },
      logger: silentLogger,
    });
    expect(await broken.toBusiness(BIZ, { title: 't', body: 'b' })).toBe(0);
  });
});
