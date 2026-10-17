import { describe, expect, it } from 'vitest';

import { AppError } from '@booking/features/lib/errors.ts';
import { runHeldClientNotifications } from '@booking/app-store/whatsapp/heldNotifications.ts';
import { runReminders } from '@booking/app-store/whatsapp/jobs.ts';
import { notifyAppointmentChanged } from '@booking/app-store/whatsapp/notifications/index.ts';
import type { NerovaClientChannel, NerovaNotification, NerovaSendOutcome } from '@booking/app-store/whatsapp/notifications/nerovaChannel.ts';
import type { AppointmentChangedEvent } from '@booking/features/ports.ts';
import { appointment, BIZ, CUSTOMER_PHONE, harness } from '@booking/testing/whatsapp/index.ts';

const APPT = '00000000-0000-4000-8000-00000000aaaa';
const STARTS = '2026-09-30T07:00:00.000Z';

function fakeChannel(over: { owns?: boolean; outcome?: NerovaSendOutcome; fail?: boolean } = {}) {
  const sent: { businessId: string; notification: NerovaNotification; key: string }[] = [];
  const channel: NerovaClientChannel = {
    ownsNumber: async () => over.owns ?? true,
    send: async (businessId, notification, key) => {
      if (over.fail) throw new AppError('UPSTREAM_COMPANION_ERROR', 'down', { status: 502 });
      sent.push({ businessId, notification, key });
      return over.outcome ?? 'sent';
    },
  };
  return { channel, sent };
}

async function setup(channel: NerovaClientChannel | undefined) {
  const h = harness();
  const client = await h.repo.upsertClientByPhone(BIZ, CUSTOMER_PHONE, 'Thandi');
  h.world.appointments.push(appointment({ id: APPT, client_id: client.id, starts_at: STARTS }));
  return { h, client, deps: { ...h.deps, nerovaChannel: channel } };
}

const event = (over: Partial<AppointmentChangedEvent> = {}): AppointmentChangedEvent => ({
  businessId: BIZ,
  appointmentId: APPT,
  kind: 'created',
  actor: { type: 'staff', id: 'user_owner' },
  notifyCustomer: true,
  ...over,
});

describe('client messages for a number that lives on Nerova', () => {
  it('goes through Nerova, never through our Graph client', async () => {
    const { channel, sent } = fakeChannel();
    const { h, deps } = await setup(channel);
    expect(await notifyAppointmentChanged(deps, event())).toBe('sent');
    expect(h.graph.sent).toHaveLength(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.notification).toMatchObject({ to: CUSTOMER_PHONE, type: 'update', clientName: 'Thandi' });
    expect(sent[0]!.notification.message).toContain('is booked for');
    expect(sent[0]!.key).toBe(`appt-created-${APPT}`);
  });

  it('sends a cancellation as the cancelled type and a move as an update', async () => {
    const { channel, sent } = fakeChannel();
    const { deps } = await setup(channel);
    await notifyAppointmentChanged(deps, event({ kind: 'cancelled' }));
    await notifyAppointmentChanged(deps, event({ kind: 'rescheduled' }));
    expect(sent.map((s) => s.notification.type)).toEqual(['cancelled', 'update']);
    expect(sent[1]!.notification.message).toContain('has been moved to');
  });

  it('keeps our own path for a business whose number is ours', async () => {
    const { channel, sent } = fakeChannel({ owns: false });
    const { h, deps } = await setup(channel);
    expect(await notifyAppointmentChanged(deps, event())).toBe('sent');
    expect(sent).toHaveLength(0);
    expect(h.graph.sent).toHaveLength(1);
  });

  it('never calls Nerova when the customer is not to be notified', async () => {
    const { channel, sent } = fakeChannel();
    const { deps } = await setup(channel);
    expect(await notifyAppointmentChanged(deps, event({ notifyCustomer: false }))).toBe('skipped');
    expect(sent).toHaveLength(0);
  });

  it('respects our opt-out and a STOP recorded at Nerova', async () => {
    const a = fakeChannel();
    const blocked = await setup(a.channel);
    blocked.h.repo.db.clients[0]!.whatsapp_opt_in = false;
    expect(await notifyAppointmentChanged(blocked.deps, event())).toBe('skipped');
    expect(a.sent).toHaveLength(0);

    const b = fakeChannel({ outcome: 'opted_out' });
    const stopped = await setup(b.channel);
    expect(await notifyAppointmentChanged(stopped.deps, event())).toBe('skipped');
  });

  it('reports a Nerova failure as failed without throwing', async () => {
    const { channel } = fakeChannel({ fail: true });
    const { deps } = await setup(channel);
    expect(await notifyAppointmentChanged(deps, event())).toBe('failed');
  });
});

describe('reminders for a number that lives on Nerova', () => {
  async function withReminder(channel: NerovaClientChannel | undefined) {
    const ctx = await setup(channel);
    ctx.h.repo.db.reminderQueue.push({ appointment_id: APPT, business_id: BIZ, client_id: ctx.client.id, offset_minutes: 1440, starts_at: STARTS });
    return ctx;
  }

  it('skips our WhatsApp reminder, because the Nerova sweep sends it', async () => {
    const { channel, sent } = fakeChannel();
    const { h, deps } = await withReminder(channel);
    expect(await runReminders(deps)).toEqual({ claimed: 1, sent: 0, failed: 0, skipped: 1 });
    expect(h.graph.sent).toHaveLength(0);
    expect(sent).toHaveLength(0);
    expect(h.repo.db.appointmentEvents[0]!.payload).toMatchObject({ state: 'skipped', reason: 'nerova_sends_reminders' });
  });

  it('still sends our reminder for a number that is ours', async () => {
    const { channel } = fakeChannel({ owns: false });
    const { h, deps } = await withReminder(channel);
    expect(await runReminders(deps)).toMatchObject({ sent: 1, skipped: 0 });
    expect(h.graph.sent).toHaveLength(1);
  });
});

describe('held client notifications job', () => {
  const claim = (clientId: string, over: { status?: 'confirmed' | 'cancelled'; voided?: boolean } = {}) => ({
    appointment_id: APPT,
    business_id: BIZ,
    client_id: clientId,
    status: over.status ?? 'confirmed',
    voided: over.voided ?? false,
  });

  it('sends the created message once the hold has passed, without a second staff push', async () => {
    const { h, client, deps } = await setup(undefined);
    h.repo.db.heldQueue.push(claim(client.id));
    expect(await runHeldClientNotifications(deps)).toEqual({ claimed: 1, sent: 1, skipped: 0, failed: 0, cleared: 0 });
    expect(h.graph.sent).toHaveLength(1);
    expect(h.pushes).toHaveLength(0);
  });

  it('is idempotent: a second run claims nothing and sends nothing', async () => {
    const { h, client, deps } = await setup(undefined);
    h.repo.db.heldQueue.push(claim(client.id));
    await runHeldClientNotifications(deps);
    expect(await runHeldClientNotifications(deps)).toEqual({ claimed: 0, sent: 0, skipped: 0, failed: 0, cleared: 0 });
    expect(h.graph.sent).toHaveLength(1);
  });

  it('sends nothing for a cancelled or voided appointment, it only clears the hold', async () => {
    const { h, client, deps } = await setup(undefined);
    h.repo.db.heldQueue.push(claim(client.id, { status: 'cancelled' }), claim(client.id, { status: 'cancelled', voided: true }));
    expect(await runHeldClientNotifications(deps)).toMatchObject({ claimed: 2, cleared: 2, sent: 0 });
    expect(h.graph.sent).toHaveLength(0);
  });

  it('delivers through Nerova for a number that lives there, with a deterministic key', async () => {
    const { channel, sent } = fakeChannel();
    const { h, client, deps } = await setup(channel);
    h.repo.db.heldQueue.push(claim(client.id));
    expect(await runHeldClientNotifications(deps)).toMatchObject({ sent: 1 });
    expect(h.graph.sent).toHaveLength(0);
    expect(sent.map((s) => s.key)).toEqual([`appt-created-${APPT}`]);
  });
});
