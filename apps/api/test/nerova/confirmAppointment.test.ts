import { describe, expect, it } from 'vitest';

import { createBookingServiceFromRepository } from '@booking/features/bookings/services/bookingService.ts';
import { advertisedCapabilities, CONFIRM_APPOINTMENTS_CAPABILITY, isConfirmAppointmentsEnabled } from '@booking/companion/connector/capabilities.ts';
import { createNerovaConnectorService } from '@booking/companion/connector/service.ts';
import { NOW, sast } from '../booking/fixtures.ts';
import { silentLogger } from '../booking/harness.ts';
import { nerovaHarness, plansEntitlements } from './harness.ts';

function setup(enabled: boolean | undefined) {
  const h = nerovaHarness();
  const booking = createBookingServiceFromRepository({
    repository: h.repo,
    notifications: { appointmentChanged: async () => undefined },
    logger: silentLogger,
    clock: () => NOW,
  });
  const service = createNerovaConnectorService({
    booking,
    entitlements: plansEntitlements(h.plans),
    repo: h.repo,
    clock: () => NOW,
    ...(enabled === undefined ? {} : { confirmAppointmentsEnabled: enabled }),
  });
  return { h, service };
}

const book = (h: ReturnType<typeof nerovaHarness>) =>
  h.ok('appointments_create', {
    accountId: h.business.id,
    idempotencyKey: 'c-1',
    externalServiceId: h.cut.id,
    externalStaffId: h.thandi.id,
    startTime: sast('09:00'),
    client: { name: 'Ada', phone: '+27820000000' },
  });

describe('connector confirmAppointment (tool not wired yet)', () => {
  it('confirms through BookingService with the nerova actor, scoping the key to the account', async () => {
    const { h, service } = setup(false);
    const created = await book(h);
    const args = { accountId: h.business.id, appointmentId: created.externalAppointmentId, idempotencyKey: 'k1', origin: { conversationId: 'wacon_9' } };
    const first = await service.confirmAppointment(args);
    expect(first.status).toBe('Scheduled');
    expect(h.repo.tables.appointments.find((a) => a.id === created.externalAppointmentId)).toMatchObject({
      client_confirmed_at: NOW.toISOString(),
      client_confirmed_via: 'whatsapp',
    });
    const event = h.repo.tables.appointment_events.find((e) => e.type === 'client_confirmed');
    expect(event).toMatchObject({ actor: 'nerova', actor_id: 'nerova:wacon_9' });
    expect(event?.payload).toMatchObject({ idempotency_key: `nerova:${h.business.id}:k1` });
    expect(await service.confirmAppointment(args)).toEqual(first);
    expect(h.repo.tables.appointment_events.filter((e) => e.type === 'client_confirmed')).toHaveLength(1);
  });

  it('answers not_found for a non-entitled account and for a malformed appointment id', async () => {
    const { h, service } = setup(true);
    await expect(service.confirmAppointment({ accountId: h.freeBusinessId, appointmentId: h.business.id })).rejects.toMatchObject({ code: 'not_found' });
    await expect(service.confirmAppointment({ accountId: h.business.id, appointmentId: 'nope' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('exposes clientConfirmedAt on the wire appointment only when the flag is on', async () => {
    for (const [enabled, expected] of [[undefined, false], [false, false], [true, true]] as const) {
      const { h, service } = setup(enabled);
      const created = await book(h);
      const confirmed = await service.confirmAppointment({ accountId: h.business.id, appointmentId: created.externalAppointmentId });
      expect('clientConfirmedAt' in confirmed).toBe(expected);
      const read = await service.appointmentsGet({ accountId: h.business.id, appointmentId: created.externalAppointmentId });
      expect('clientConfirmedAt' in read).toBe(expected);
      if (expected) expect(read).toMatchObject({ clientConfirmedAt: NOW.toISOString() });
    }
  });

  it('does not add the field to an unconfirmed appointment, even with the flag on', async () => {
    const { h, service } = setup(true);
    const created = await book(h);
    const read = await service.appointmentsGet({ accountId: h.business.id, appointmentId: created.externalAppointmentId });
    expect(read).not.toHaveProperty('clientConfirmedAt');
  });
});

describe('confirm_appointments capability flag', () => {
  it('is off unless the env flag is exactly "true", and is advertised only then', () => {
    expect(isConfirmAppointmentsEnabled({})).toBe(false);
    expect(isConfirmAppointmentsEnabled({ NEROVA_CONFIRM_APPOINTMENTS_ENABLED: '1' })).toBe(false);
    expect(isConfirmAppointmentsEnabled({ NEROVA_CONFIRM_APPOINTMENTS_ENABLED: 'true' })).toBe(true);
    expect(advertisedCapabilities({ confirmAppointments: false })).toEqual([]);
    expect(advertisedCapabilities({ confirmAppointments: true })).toEqual([CONFIRM_APPOINTMENTS_CAPABILITY]);
  });
});
