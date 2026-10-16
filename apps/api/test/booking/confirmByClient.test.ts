import { beforeEach, describe, expect, it } from 'vitest';

import { createBookingServiceFromRepository } from '@booking/features/bookings/services/bookingService.ts';
import { AppError } from '@booking/features/lib/errors.ts';
import type { Actor, BookingService } from '@booking/features/ports.ts';
import { NOW, sast, seed, type Seed } from './fixtures.ts';
import { silentLogger } from './harness.ts';

const nerova: Actor = { type: 'nerova', id: 'nerova:wacon_01' };
const staff: Actor = { type: 'staff', id: 'user_staff' };

describe('BookingService.confirmByClient', () => {
  let s: Seed;
  let booking: BookingService;

  beforeEach(() => {
    s = seed();
    booking = createBookingServiceFromRepository({
      repository: s.repo,
      notifications: { appointmentChanged: async () => undefined },
      logger: silentLogger,
      clock: () => NOW,
    });
  });

  const book = () =>
    booking.createAppointment({
      businessId: s.business.id,
      clientId: s.client.id,
      serviceId: s.cut.id,
      startsAt: sast('09:00'),
      source: 'nerova',
      idempotencyKey: `k-${Math.random()}`,
      actor: nerova,
    });
  const confirm = (appointmentId: string, over: Record<string, unknown> = {}) =>
    booking.confirmByClient({
      businessId: s.business.id,
      appointmentId,
      confirmedAt: '2026-09-29T08:00:00Z',
      via: 'whatsapp',
      actor: nerova,
      idempotencyKey: 'confirm-1',
      ...over,
    });
  const confirmEvents = () => s.repo.tables.appointment_events.filter((e) => e.type === 'client_confirmed');

  it('stores when and where the client confirmed and writes one event with the nerova actor', async () => {
    const appt = await book();
    expect(appt).toMatchObject({ client_confirmed_at: null, client_confirmed_via: null });
    const confirmed = await confirm(appt.id);
    expect(confirmed).toMatchObject({ client_confirmed_at: '2026-09-29T08:00:00.000Z', client_confirmed_via: 'whatsapp', status: 'confirmed' });
    expect(confirmEvents()).toEqual([expect.objectContaining({ appointment_id: appt.id, actor: 'nerova', actor_id: 'nerova:wacon_01' })]);
    expect((await booking.getAppointment(s.business.id, appt.id))?.client_confirmed_via).toBe('whatsapp');
  });

  it('returns an already confirmed appointment unchanged, for the same key and for a new one', async () => {
    const appt = await book();
    const first = await confirm(appt.id);
    expect(await confirm(appt.id)).toEqual(first);
    expect(await confirm(appt.id, { idempotencyKey: 'confirm-2', confirmedAt: '2026-09-30T01:00:00Z', via: 'sms' })).toEqual(first);
    expect(confirmEvents()).toHaveLength(1);
  });

  it('is a no-op for a cancelled appointment', async () => {
    const appt = await book();
    await booking.cancelAppointment({ businessId: s.business.id, appointmentId: appt.id, actor: staff });
    const result = await confirm(appt.id);
    expect(result).toMatchObject({ status: 'cancelled', client_confirmed_at: null, client_confirmed_via: null });
    expect(confirmEvents()).toHaveLength(0);
  });

  it('is a no-op for a completed appointment', async () => {
    const appt = await book();
    await booking.setAppointmentStatus(s.business.id, appt.id, 'completed', staff);
    expect(await confirm(appt.id)).toMatchObject({ status: 'completed', client_confirmed_at: null });
    expect(confirmEvents()).toHaveLength(0);
  });

  it('is scoped to the business: another business cannot confirm it', async () => {
    const appt = await book();
    const err = await confirm(appt.id, { businessId: '00000000-0000-4000-8000-0000000000ff' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('NOT_FOUND');
    expect(confirmEvents()).toHaveLength(0);
    expect((await booking.getAppointment(s.business.id, appt.id))?.client_confirmed_at).toBeNull();
  });
});
