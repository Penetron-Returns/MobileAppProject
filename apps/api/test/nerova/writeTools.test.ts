import { describe, expect, it } from 'vitest';

import { AppError } from '@booking/features/lib/errors.ts';
import type { BookingService } from '@booking/features/ports.ts';
import { sast } from '../booking/fixtures.ts';
import { nerovaHarness, type NerovaHarness } from './harness.ts';

const code = (r: { structuredContent: { code?: string } }) => r.structuredContent.code;

const createArgs = (h: NerovaHarness, over: Record<string, unknown> = {}) => ({
  accountId: h.business.id,
  idempotencyKey: 'create-1',
  externalServiceId: h.cut.id,
  externalStaffId: h.thandi.id,
  startTime: sast('09:00'),
  client: { name: 'Ada Lovelace', phone: '+27820000000', email: 'ada@example.com' },
  origin: { source: 'nerova', channel: 'whatsapp', conversationId: 'wacon_01' },
  ...over,
});

const events = (h: NerovaHarness) => h.repo.tables.appointment_events;

describe('appointments_create', () => {
  it('books through BookingService with source and actor nerova, then reads back identically', async () => {
    const h = nerovaHarness();
    const created = await h.ok('appointments_create', createArgs(h));
    expect(created).toMatchObject({
      externalServiceId: h.cut.id,
      externalStaffId: h.thandi.id,
      startTime: sast('09:00'),
      endTime: sast('10:00'),
      status: 'Scheduled',
      externalLocationId: h.business.id,
    });
    expect(await h.ok('appointments_get', { accountId: h.business.id, appointmentId: created.externalAppointmentId })).toEqual(created);

    const row = h.repo.tables.appointments.find((a) => a.id === created.externalAppointmentId)!;
    expect(row.source).toBe('nerova');
    expect(row.price_cents).toBe(60000);
    expect(events(h).find((e) => e.type === 'created')).toMatchObject({ actor: 'nerova', actor_id: 'nerova:wacon_01' });
    // Pip talks to the customer; our own WhatsApp confirmation must not fire
    expect(h.changes).toEqual([expect.objectContaining({ kind: 'created', notifyCustomer: false, actor: { type: 'nerova', id: 'nerova:wacon_01' } })]);
  });

  it('creates the client by phone and reuses it by externalClientId', async () => {
    const h = nerovaHarness();
    const first = await h.ok('appointments_create', createArgs(h));
    const second = await h.ok(
      'appointments_create',
      createArgs(h, { idempotencyKey: 'create-2', startTime: sast('11:00'), client: { name: 'Ada', externalClientId: first.externalClientId } }),
    );
    expect(second.externalClientId).toBe(first.externalClientId);
    const sameByPhone = await h.ok('appointments_create', createArgs(h, { idempotencyKey: 'create-3', startTime: sast('14:00') }));
    expect(sameByPhone.externalClientId).toBe(first.externalClientId);
    expect(h.repo.tables.clients.filter((c) => c.phone_e164 === '+27820000000')).toHaveLength(1);
  });

  it('replays the same appointment for a repeated idempotencyKey and never books twice', async () => {
    const h = nerovaHarness();
    const first = await h.ok('appointments_create', createArgs(h));
    const again = await h.ok('appointments_create', createArgs(h));
    expect(again).toEqual(first);
    // even when the retry carries a different slot, the first booking wins
    const other = await h.ok('appointments_create', createArgs(h, { startTime: sast('15:00') }));
    expect(other.externalAppointmentId).toBe(first.externalAppointmentId);
    expect(h.repo.tables.appointments).toHaveLength(1);
    expect(h.changes).toHaveLength(1);
  });

  it('scopes the key to the account so another business cannot collide with it', async () => {
    const h = nerovaHarness();
    await h.ok('appointments_create', createArgs(h));
    const key = h.repo.tables.appointments[0]!.idempotency_key;
    expect(key).toBe(`nerova:${h.business.id}:create-1`);
  });

  it('requires an idempotencyKey', async () => {
    const h = nerovaHarness();
    const { idempotencyKey: _omit, ...rest } = createArgs(h);
    expect(code(await h.tool('appointments_create', rest))).toBe('invalid_request');
    expect(code(await h.tool('appointments_create', createArgs(h, { idempotencyKey: '' })))).toBe('invalid_request');
    expect(h.repo.tables.appointments).toHaveLength(0);
  });

  it('answers conflict when the slot is taken, and writes nothing', async () => {
    const h = nerovaHarness();
    await h.ok('appointments_create', createArgs(h));
    const clash = await h.tool('appointments_create', createArgs(h, { idempotencyKey: 'create-clash', client: { name: 'B', phone: '+27821112222' } }));
    expect(clash.isError).toBe(true);
    expect(code(clash)).toBe('conflict');
    expect(h.repo.tables.appointments).toHaveLength(1);
  });

  it.each([
    ['outside opening hours', { startTime: sast('20:00') }],
    ['a service that is not offered', (h: NerovaHarness) => ({ externalServiceId: h.inactive.id })],
    ['a staff member not taking bookings', (h: NerovaHarness) => ({ externalStaffId: h.off.id })],
  ])('answers conflict for %s', async (_label, over) => {
    const h = nerovaHarness();
    const extra = typeof over === 'function' ? over(h) : over;
    expect(code(await h.tool('appointments_create', createArgs(h, extra)))).toBe('conflict');
  });

  it('answers not_found for an unknown service, staff or client', async () => {
    const h = nerovaHarness();
    const ghost = '00000000-0000-4000-8000-0000000000aa';
    expect(code(await h.tool('appointments_create', createArgs(h, { externalServiceId: ghost })))).toBe('not_found');
    expect(code(await h.tool('appointments_create', createArgs(h, { externalStaffId: ghost })))).toBe('not_found');
    expect(code(await h.tool('appointments_create', createArgs(h, { externalStaffId: 'staff_nope' })))).toBe('not_found');
    expect(code(await h.tool('appointments_create', createArgs(h, { client: { name: 'A', externalClientId: ghost } })))).toBe('not_found');
  });

  it('rejects a client we cannot identify, and a bad time', async () => {
    const h = nerovaHarness();
    expect(code(await h.tool('appointments_create', createArgs(h, { client: { name: 'No Phone' } })))).toBe('invalid_request');
    expect(code(await h.tool('appointments_create', createArgs(h, { client: { name: 'Bad', phone: 'abc' } })))).toBe('invalid_request');
    expect(code(await h.tool('appointments_create', createArgs(h, { startTime: 'soon' })))).toBe('invalid_request');
  });

  it('refuses a blocked client with conflict', async () => {
    const h = nerovaHarness();
    h.client.is_blocked = true;
    h.repo.tables.clients.find((c) => c.id === h.client.id)!.is_blocked = true;
    const res = await h.tool('appointments_create', createArgs(h, { client: { name: 'Nadia', phone: h.client.phone_e164 } }));
    expect(code(res)).toBe('conflict');
  });

  it('keeps notes and the booking reason', async () => {
    const h = nerovaHarness();
    const created = await h.ok('appointments_create', createArgs(h, { notes: 'Booked by Nerova', reason: 'trim' }));
    expect(created.notes).toBe('Booked by Nerova\nReason: trim');
  });

  it('does not book a Free-plan business', async () => {
    const h = nerovaHarness();
    const res = await h.tool('appointments_create', createArgs(h, { accountId: h.freeBusinessId }));
    expect(code(res)).toBe('not_found');
    expect(h.repo.tables.appointments).toHaveLength(0);
    expect(h.repo.tables.clients.some((c) => c.business_id === h.freeBusinessId)).toBe(false);
  });
});

describe('appointments_reschedule', () => {
  async function booked(h: NerovaHarness, time = '09:00') {
    return h.ok('appointments_create', createArgs(h, { startTime: sast(time), origin: undefined }));
  }
  const move = (h: NerovaHarness, appointmentId: string, extra: Record<string, unknown>) =>
    h.tool('appointments_reschedule', { accountId: h.business.id, appointmentId, ...extra });

  it('moves the appointment, audits it as nerova and reads back', async () => {
    const h = nerovaHarness();
    const a = await booked(h);
    const res = await move(h, a.externalAppointmentId, { newStartTime: sast('14:00'), origin: { source: 'nerova' } });
    expect(res.isError).toBeUndefined();
    expect(res.structuredContent).toMatchObject({ startTime: sast('14:00'), endTime: sast('15:00'), status: 'Scheduled' });
    expect(await h.ok('appointments_get', { accountId: h.business.id, appointmentId: a.externalAppointmentId })).toEqual(res.structuredContent);
    expect(events(h).find((e) => e.type === 'rescheduled')).toMatchObject({ actor: 'nerova', actor_id: 'nerova' });
    expect(h.changes.at(-1)).toMatchObject({ kind: 'rescheduled', notifyCustomer: false });
  });

  it('can move to a specific staff member', async () => {
    const h = nerovaHarness();
    const a = await booked(h);
    const res = await move(h, a.externalAppointmentId, { newStartTime: sast('09:00'), newExternalStaffId: h.sipho.id });
    expect(res.structuredContent.externalStaffId).toBe(h.sipho.id);
  });

  it('answers conflict for an occupied slot and for a cancelled appointment', async () => {
    const h = nerovaHarness();
    const a = await booked(h, '09:00');
    await h.ok('appointments_create', createArgs(h, { idempotencyKey: 'x', startTime: sast('11:00'), origin: undefined, client: { name: 'B', phone: '+27821112222' } }));
    // pinned to the same staff member, otherwise a free colleague would be chosen
    expect(code(await move(h, a.externalAppointmentId, { newStartTime: sast('11:00'), newExternalStaffId: h.thandi.id }))).toBe('conflict');
    await h.ok('appointments_cancel', { accountId: h.business.id, appointmentId: a.externalAppointmentId });
    expect(code(await move(h, a.externalAppointmentId, { newStartTime: sast('15:00') }))).toBe('conflict');
  });

  it('answers not_found and invalid_request', async () => {
    const h = nerovaHarness();
    expect(code(await move(h, '00000000-0000-4000-8000-0000000000aa', { newStartTime: sast('10:00') }))).toBe('not_found');
    expect(code(await move(h, 'appt_nope', { newStartTime: sast('10:00') }))).toBe('not_found');
    const a = await booked(h);
    expect(code(await move(h, a.externalAppointmentId, { newStartTime: 'later' }))).toBe('invalid_request');
    expect(code(await move(h, a.externalAppointmentId, { newStartTime: sast('10:00'), newExternalStaffId: 'nope' }))).toBe('not_found');
  });

  it('holds every change to the cancellation window unless the origin says the owner is directing Pip', async () => {
    const h = nerovaHarness();
    // "now" is Monday 08:00 SAST and the window is 24h: Monday 15:00 is 7h away
    const soon = await h.ok('appointments_create', createArgs(h, { startTime: sast('15:00', '2026-09-28'), origin: undefined }));
    const viaCustomer = await move(h, soon.externalAppointmentId, { newStartTime: sast('16:00', '2026-09-28'), origin: { source: 'nerova', channel: 'whatsapp' } });
    expect(code(viaCustomer)).toBe('conflict');
    // no origin, or a source without a channel, is not proof of the owner: the window applies
    expect(code(await move(h, soon.externalAppointmentId, { newStartTime: sast('16:00', '2026-09-28') }))).toBe('conflict');
    expect(code(await move(h, soon.externalAppointmentId, { newStartTime: sast('16:00', '2026-09-28'), origin: { source: 'nerova' } }))).toBe('conflict');
    const viaOwner = await move(h, soon.externalAppointmentId, { newStartTime: sast('16:00', '2026-09-28'), origin: { source: 'nerova', channel: 'owner_chat' } });
    expect(viaOwner.isError).toBeUndefined();
  });
});

describe('appointments_cancel', () => {
  it('cancels, keeps the reason and audits it as nerova', async () => {
    const h = nerovaHarness();
    const a = await h.ok('appointments_create', createArgs(h));
    const res = await h.tool('appointments_cancel', { accountId: h.business.id, appointmentId: a.externalAppointmentId, reason: 'Changed plans', origin: { source: 'nerova' } });
    expect(res.structuredContent).toMatchObject({ status: 'Cancelled', externalAppointmentId: a.externalAppointmentId });
    expect(h.repo.tables.appointments[0]).toMatchObject({ status: 'cancelled', cancel_reason: 'Changed plans' });
    expect(events(h).find((e) => e.type === 'cancelled')).toMatchObject({ actor: 'nerova' });
    // the freed slot can be booked again
    const rebook = await h.tool('appointments_create', createArgs(h, { idempotencyKey: 'again', client: { name: 'C', phone: '+27823334444' } }));
    expect(rebook.isError).toBeUndefined();
  });

  it('answers not_found for unknown ids', async () => {
    const h = nerovaHarness();
    expect(code(await h.tool('appointments_cancel', { accountId: h.business.id, appointmentId: '00000000-0000-4000-8000-0000000000aa' }))).toBe('not_found');
    expect(code(await h.tool('appointments_cancel', { accountId: h.business.id, appointmentId: 'x' }))).toBe('not_found');
  });

  it('holds customer-facing cancellations to the window', async () => {
    const h = nerovaHarness();
    const soon = await h.ok('appointments_create', createArgs(h, { startTime: sast('15:00', '2026-09-28'), origin: undefined }));
    const late = await h.tool('appointments_cancel', { accountId: h.business.id, appointmentId: soon.externalAppointmentId, origin: { source: 'nerova', channel: 'whatsapp' } });
    expect(code(late)).toBe('conflict');
    expect(h.repo.tables.appointments[0]!.status).toBe('confirmed');
    expect(code(await h.tool('appointments_cancel', { accountId: h.business.id, appointmentId: soon.externalAppointmentId }))).toBe('conflict');
    const owner = await h.tool('appointments_cancel', { accountId: h.business.id, appointmentId: soon.externalAppointmentId, origin: { source: 'nerova', channel: 'owner_chat' } });
    expect(owner.structuredContent.status).toBe('Cancelled');
  });

  it('cannot cancel an appointment of another account', async () => {
    const h = nerovaHarness();
    const a = await h.ok('appointments_create', createArgs(h));
    const second = h.repo.nextId();
    h.repo.tables.businesses.push({ ...h.business, id: second, clerk_org_id: 'o2', slug: 's2' });
    h.plans.set(second, 'growth');
    const res = await h.tool('appointments_cancel', { accountId: second, appointmentId: a.externalAppointmentId });
    expect(code(res)).toBe('not_found');
    expect(h.repo.tables.appointments[0]!.status).toBe('confirmed');
  });
});

describe('appointments_create client details', () => {
  it('never overwrites the stored name or email of an existing client', async () => {
    const h = nerovaHarness();
    await h.ok('appointments_create', createArgs(h));
    await h.ok(
      'appointments_create',
      createArgs(h, { idempotencyKey: 'create-other', startTime: sast('11:00'), client: { name: 'Mallory', phone: '+27820000000', email: 'm@example.com' } }),
    );
    const client = h.repo.tables.clients.find((c) => c.phone_e164 === '+27820000000')!;
    expect(client.name).toBe('Ada Lovelace');
    expect(client.email).toBe('ada@example.com');
  });
});

describe('instant arguments', () => {
  it.each(['2026-10-20T10:00', '2026-10-20T10:00:00', '2026-10-20', '2026-10-20 10:00Z'])('rejects %s (no explicit offset)', async (value) => {
    const h = nerovaHarness();
    expect(code(await h.tool('appointments_create', createArgs(h, { startTime: value })))).toBe('invalid_request');
    expect(h.repo.tables.appointments).toHaveLength(0);
  });

  it.each(['2026-10-20T10:00:00Z', '2026-10-20T10:00:00+02:00', '2026-10-20T10:00:00.000Z'])('accepts %s', async (value) => {
    const h = nerovaHarness();
    expect(code(await h.tool('appointments_create', createArgs(h, { startTime: value })))).not.toBe('invalid_request');
  });
});

describe('appointments_create racing on the same idempotencyKey', () => {
  it('returns the winner instead of a conflict when the slot is taken by the same key', async () => {
    let winner: Awaited<ReturnType<BookingService['createAppointment']>> | undefined;
    const h = nerovaHarness({
      wrapBooking: (real) => ({
        ...real,
        // the concurrent twin commits first, then this call trips the exclusion constraint
        async createAppointment(input) {
          winner = await real.createAppointment(input);
          throw new AppError('SLOT_UNAVAILABLE', 'That time slot is no longer available');
        },
      }),
    });
    const result = await h.tool('appointments_create', createArgs(h));
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.externalAppointmentId).toBe(winner!.id);
    expect(h.repo.tables.appointments).toHaveLength(1);
  });

  it('still answers conflict when the slot is taken by a different booking', async () => {
    const h = nerovaHarness();
    await h.ok('appointments_create', createArgs(h));
    const other = await h.tool('appointments_create', createArgs(h, { idempotencyKey: 'create-other', client: { name: 'Bo', phone: '+27821111111' } }));
    expect(code(other)).toBe('conflict');
  });
});

describe('cancellation window by origin channel', () => {
  const soon = '2026-09-28'; // "now" is Monday 08:00 SAST, window 24h: 15:00 is inside it
  const later = '2026-10-05';
  const move = (h: NerovaHarness, appointmentId: string, extra: Record<string, unknown>) =>
    h.tool('appointments_reschedule', { accountId: h.business.id, appointmentId, ...extra });
  const origins: Array<[string, { source: 'nerova'; channel?: string } | undefined, boolean]> = [
    ['no origin', undefined, false],
    ['whatsapp', { source: 'nerova', channel: 'whatsapp' }, false],
    ['owner', { source: 'nerova', channel: 'owner' }, true],
    ['owner_chat', { source: 'nerova', channel: 'owner_chat' }, true],
    ['owner_whatsapp', { source: 'nerova', channel: 'owner_whatsapp' }, true],
    ['system', { source: 'nerova', channel: 'system' }, true],
    ['conformance', { source: 'nerova', channel: 'conformance' }, true],
  ];

  describe.each([['inside', soon], ['outside', later]])('%s the window', (where, date) => {
    it.each(origins)('reschedule with %s', async (_name, origin, exempt) => {
      const h = nerovaHarness();
      const a = await h.ok('appointments_create', createArgs(h, { startTime: sast('15:00', date), origin: undefined }));
      const res = await move(h, a.externalAppointmentId, { newStartTime: sast('16:00', date), ...(origin ? { origin } : {}) });
      if (where === 'inside' && !exempt) expect(code(res)).toBe('conflict');
      else expect(res.isError).toBeUndefined();
    });

    it.each(origins)('cancel with %s', async (_name, origin, exempt) => {
      const h = nerovaHarness();
      const a = await h.ok('appointments_create', createArgs(h, { startTime: sast('15:00', date), origin: undefined }));
      const res = await h.tool('appointments_cancel', { accountId: h.business.id, appointmentId: a.externalAppointmentId, ...(origin ? { origin } : {}) });
      if (where === 'inside' && !exempt) expect(code(res)).toBe('conflict');
      else expect(res.structuredContent.status).toBe('Cancelled');
    });
  });
});
