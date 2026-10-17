import { describe, expect, it } from 'vitest';

import { declaredToolCapabilities } from '@booking/companion/connector/capabilities.ts';
import { NOW, sast } from '../booking/fixtures.ts';
import { nerovaHarness, type NerovaHarness } from './harness.ts';

const UNTIL = new Date(NOW.getTime() + 45_000).toISOString();
const code = (r: { structuredContent: { code?: string } }) => r.structuredContent.code;

const createArgs = (h: NerovaHarness, clientNotification?: Record<string, unknown>) => ({
  accountId: h.business.id,
  idempotencyKey: 'create-1',
  externalServiceId: h.cut.id,
  externalStaffId: h.thandi.id,
  startTime: sast('09:00'),
  client: { name: 'Ada Lovelace', phone: '+27820000000' },
  origin: { source: 'nerova', channel: 'owner_chat', conversationId: 'wacon_01', ...(clientNotification ? { clientNotification } : {}) },
});

const row = (h: NerovaHarness, id: string) => h.repo.tables.appointments.find((a) => a.id === id)!;
const eventTypes = (h: NerovaHarness) => h.repo.tables.appointment_events.map((e) => e.type);

describe('origin.clientNotification hold on create', () => {
  it('books at once, stores the hold and sends the client nothing now', async () => {
    const h = nerovaHarness();
    const created = await h.ok('appointments_create', createArgs(h, { mode: 'hold', until: UNTIL }));
    expect(created.status).toBe('Scheduled');
    expect(row(h, created.externalAppointmentId).client_notify_after).toBe(UNTIL);
    // The owner's devices still hear about it; the customer does not.
    expect(h.changes).toEqual([expect.objectContaining({ kind: 'created', notifyCustomer: false })]);
  });

  it('an absent field is today\'s behaviour: no hold, no customer notification', async () => {
    const h = nerovaHarness();
    const created = await h.ok('appointments_create', createArgs(h));
    expect(row(h, created.externalAppointmentId).client_notify_after ?? null).toBeNull();
    expect(h.changes).toEqual([expect.objectContaining({ kind: 'created', notifyCustomer: false })]);
  });

  it('a replay with the same key returns the first booking and keeps its hold', async () => {
    const h = nerovaHarness();
    const first = await h.ok('appointments_create', createArgs(h, { mode: 'hold', until: UNTIL }));
    const again = await h.ok('appointments_create', createArgs(h, { mode: 'hold', until: UNTIL }));
    expect(again.externalAppointmentId).toBe(first.externalAppointmentId);
    expect(h.repo.tables.appointments).toHaveLength(1);
  });

  it.each([
    ['suppress on create', { mode: 'suppress' }],
    ['a hold without until', { mode: 'hold' }],
    ['a hold with an invalid until', { mode: 'hold', until: 'tomorrow' }],
    ['a hold a week out', { mode: 'hold', until: new Date(NOW.getTime() + 7 * 86_400_000).toISOString() }],
    ['an unknown mode', { mode: 'later' }],
  ])('rejects %s as invalid_request and books nothing', async (_label, clientNotification) => {
    const h = nerovaHarness();
    const r = await h.tool('appointments_create', createArgs(h, clientNotification));
    expect(r.isError).toBe(true);
    expect(code(r)).toBe('invalid_request');
    expect(h.repo.tables.appointments).toHaveLength(0);
  });
});

describe('origin.clientNotification suppress on cancel (the undo)', () => {
  async function held(h: NerovaHarness) {
    return h.ok('appointments_create', createArgs(h, { mode: 'hold', until: UNTIL }));
  }
  const cancelArgs = (h: NerovaHarness, id: string, clientNotification?: Record<string, unknown>) => ({
    accountId: h.business.id,
    appointmentId: id,
    origin: { source: 'nerova', channel: 'owner_chat', ...(clientNotification ? { clientNotification } : {}) },
  });

  it('voids the booking: cancelled, voided, event voided (not cancelled), no client message', async () => {
    const h = nerovaHarness();
    const created = await held(h);
    h.changes.length = 0;
    const out = await h.ok('appointments_cancel', cancelArgs(h, created.externalAppointmentId, { mode: 'suppress' }));
    expect(out.status).toBe('Cancelled');
    const r = row(h, created.externalAppointmentId);
    expect(r.voided_at).toEqual(expect.any(String));
    expect(r.cancel_reason).toBe('voided');
    expect(r.client_notify_after).toBeNull();
    expect(eventTypes(h)).toContain('voided');
    expect(eventTypes(h)).not.toContain('cancelled');
    expect(h.changes.every((c) => c.notifyCustomer === false)).toBe(true);
  });

  it('frees the slot again', async () => {
    const h = nerovaHarness();
    const created = await held(h);
    await h.ok('appointments_cancel', cancelArgs(h, created.externalAppointmentId, { mode: 'suppress' }));
    const rebooked = await h.ok('appointments_create', { ...createArgs(h), idempotencyKey: 'create-2' });
    expect(rebooked.status).toBe('Scheduled');
  });

  it('a plain cancel stays a normal cancellation (no void), and a held one tells the client nothing', async () => {
    const h = nerovaHarness();
    const created = await held(h);
    h.changes.length = 0;
    await h.ok('appointments_cancel', cancelArgs(h, created.externalAppointmentId));
    const r = row(h, created.externalAppointmentId);
    expect(r.voided_at ?? null).toBeNull();
    expect(eventTypes(h)).toContain('cancelled');
    expect(h.changes.every((c) => c.notifyCustomer === false)).toBe(true);
  });

  it('cancelling a held booking through the booking service never announces it to the client', async () => {
    const h = nerovaHarness();
    const created = await held(h);
    h.changes.length = 0;
    await h.container.booking.cancelAppointment({
      businessId: h.business.id,
      appointmentId: created.externalAppointmentId,
      actor: { type: 'staff', id: 'user_owner' },
      notifyCustomer: true,
      now: NOW,
    });
    expect(h.changes).toEqual([expect.objectContaining({ kind: 'cancelled', notifyCustomer: false })]);
  });

  it('rejects hold on cancel', async () => {
    const h = nerovaHarness();
    const created = await held(h);
    const r = await h.tool('appointments_cancel', cancelArgs(h, created.externalAppointmentId, { mode: 'hold', until: UNTIL }));
    expect(code(r)).toBe('invalid_request');
  });

  it('an already cancelled booking cannot be voided again', async () => {
    const h = nerovaHarness();
    const created = await held(h);
    await h.ok('appointments_cancel', cancelArgs(h, created.externalAppointmentId, { mode: 'suppress' }));
    const r = await h.tool('appointments_cancel', cancelArgs(h, created.externalAppointmentId, { mode: 'suppress' }));
    expect(r.isError).toBe(true);
  });
});

describe('HoldClientNotifications capability', () => {
  it('is declared by the published create schema, with the contract version unchanged', async () => {
    const h = nerovaHarness();
    const { body } = await h.rpc('tools/list');
    const tools = body.result.tools as { name: string; inputSchema: any }[];
    expect(declaredToolCapabilities(tools)).toContain('HoldClientNotifications');
    for (const name of ['appointments_create', 'appointments_cancel']) {
      const origin = tools.find((t) => t.name === name)!.inputSchema.properties.origin;
      expect(origin.properties.clientNotification.properties.mode.enum).toEqual(['hold', 'suppress']);
      expect(origin.required).toEqual(['source']);
    }
  });
});
