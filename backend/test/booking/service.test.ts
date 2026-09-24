import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createBookingServiceFromRepository } from '../../src/booking/service';
import { AppError } from '../../src/lib/errors';
import type { Logger } from '../../src/lib/logger';
import type { Actor, AppointmentChangedEvent, BookingService, CreateAppointmentInput } from '../../src/ports';
import { NOW, sast, seed, WED, type Seed } from './fixtures';

const staffActor: Actor = { type: 'staff', id: 'user_staff' };

const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {}, child: () => silentLogger };

async function expectAppError(p: Promise<unknown>, code: string, rule?: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  if (rule) expect((err as AppError).details).toEqual({ rule });
}

describe('BookingService', () => {
  let s: Seed;
  let events: AppointmentChangedEvent[];
  let booking: BookingService;

  beforeEach(() => {
    s = seed();
    events = [];
    booking = createBookingServiceFromRepository({
      repository: s.repo,
      notifications: { appointmentChanged: async (e) => void events.push(e) },
      logger: silentLogger,
      clock: () => NOW,
    });
  });

  const create = (over: Partial<CreateAppointmentInput> = {}) =>
    booking.createAppointment({
      businessId: s.business.id,
      clientId: s.client.id,
      serviceId: s.cut.id,
      startsAt: sast('09:00'),
      source: 'app',
      idempotencyKey: `k-${Math.random()}`,
      actor: staffActor,
      ...over,
    });

  describe('catalog reads', () => {
    it('returns the business with merged booking rules', async () => {
      const b = await booking.getBusiness(s.business.id);
      expect(b.booking_rules.slot_interval_minutes).toBe(30);
      expect(b.booking_rules.reminder_offsets_minutes).toEqual([1440, 120]);
      await expectAppError(booking.getBusiness('00000000-0000-4000-8000-999999999999'), 'NOT_FOUND');
    });

    it('lists services and bookable staff', async () => {
      expect((await booking.listServices(s.business.id, { activeOnly: true })).map((x) => x.name)).toEqual(['Colour', 'Cut']);
      expect(await booking.listServices(s.business.id)).toHaveLength(3);
      expect((await booking.listBookableStaff(s.business.id, s.cut.id)).map((x) => x.name)).toEqual(['Thandi', 'Sipho']);
      expect((await booking.listBookableStaff(s.business.id, s.colour.id)).map((x) => x.name)).toEqual(['Thandi']);
    });
  });

  describe('availability', () => {
    it('lists slots for a date with staff in tie-break order', async () => {
      const res = await booking.listAvailableSlots({ businessId: s.business.id, serviceId: s.cut.id, date: WED });
      expect(res.timezone).toBe('Africa/Johannesburg');
      expect(res.slots[0]).toEqual({ starts_at: sast('09:00'), ends_at: sast('10:00'), staff_ids: [s.thandi.id, s.sipho.id] });
      // 09:00..11:00 then 13:00..16:00 at 30-min steps
      expect(res.slots).toHaveLength(5 + 7);
    });

    it('filters by staff and hides inactive services', async () => {
      const one = await booking.listAvailableSlots({ businessId: s.business.id, serviceId: s.cut.id, staffId: s.sipho.id, date: WED });
      expect(one.slots.every((x) => x.staff_ids.join() === s.sipho.id)).toBe(true);
      const none = await booking.listAvailableSlots({ businessId: s.business.id, serviceId: s.cut.id, staffId: s.off.id, date: WED });
      expect(none.slots).toEqual([]);
      const inactive = await booking.listAvailableSlots({ businessId: s.business.id, serviceId: s.inactive.id, date: WED });
      expect(inactive.slots).toEqual([]);
      await expectAppError(
        booking.listAvailableSlots({ businessId: s.business.id, serviceId: '00000000-0000-4000-8000-999999999999', date: WED }),
        'NOT_FOUND',
      );
    });

    it('lists available days, clipped to the horizon', async () => {
      s.business.booking_rules = { ...s.business.booking_rules, booking_horizon_days: 7 };
      const days = await booking.listAvailableDays({ businessId: s.business.id, serviceId: s.cut.id, from: '2026-09-01', to: '2026-12-31' });
      expect(days).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05']);
    });

    it('reflects existing appointments and overrides', async () => {
      await create({ staffId: s.thandi.id });
      s.repo.tables.availability_overrides.push({
        id: s.repo.nextId(),
        business_id: s.business.id,
        staff_id: s.sipho.id,
        date: WED,
        is_closed: true,
        start_time: null,
        end_time: null,
        reason: 'Leave',
      });
      const res = await booking.listAvailableSlots({ businessId: s.business.id, serviceId: s.cut.id, date: WED });
      expect(res.slots[0]!.starts_at).toBe(sast('10:00'));
      expect(res.slots.every((x) => x.staff_ids.join() === s.thandi.id)).toBe(true);
    });
  });

  describe('createAppointment', () => {
    it('books the deterministic "no preference" staff and notifies', async () => {
      const appt = await create({ notifyCustomer: true });
      expect(appt).toMatchObject({
        staff_id: s.thandi.id,
        starts_at: sast('09:00'),
        ends_at: sast('10:00'),
        status: 'confirmed',
        source: 'app',
        price_cents: 60_000,
      });
      expect(events).toEqual([
        { businessId: s.business.id, appointmentId: appt.id, kind: 'created', actor: staffActor, notifyCustomer: true },
      ]);
      expect(s.repo.tables.appointment_events.map((e) => e.type)).toEqual(['created']);
    });

    it('spreads load: fewest appointments that day wins', async () => {
      await create({ startsAt: sast('15:00'), staffId: s.thandi.id });
      const appt = await create({ startsAt: sast('09:00') });
      expect(appt.staff_id).toBe(s.sipho.id);
    });

    it('honours an explicit staff member', async () => {
      const appt = await create({ staffId: s.sipho.id });
      expect(appt.staff_id).toBe(s.sipho.id);
    });

    it('rejects taken, misaligned, closed and too-soon starts with SLOT_UNAVAILABLE', async () => {
      await create({ staffId: s.thandi.id });
      await expectAppError(create({ staffId: s.thandi.id, startsAt: sast('09:30') }), 'SLOT_UNAVAILABLE');
      await expectAppError(create({ startsAt: sast('09:10') }), 'SLOT_UNAVAILABLE');
      await expectAppError(create({ startsAt: sast('12:00') }), 'SLOT_UNAVAILABLE');
      await expectAppError(create({ startsAt: sast('09:00', '2026-09-27') }), 'SLOT_UNAVAILABLE');
      await expectAppError(create({ startsAt: sast('07:00', '2026-09-28') }), 'SLOT_UNAVAILABLE');
      expect(events).toHaveLength(1);
    });

    it('explains why an explicit staff member cannot be booked', async () => {
      await expectAppError(create({ staffId: s.off.id }), 'RULE_VIOLATION', 'STAFF_INACTIVE');
      await expectAppError(create({ serviceId: s.colour.id, staffId: s.sipho.id }), 'RULE_VIOLATION', 'STAFF_NOT_QUALIFIED');
      await expectAppError(create({ staffId: '00000000-0000-4000-8000-999999999999' }), 'NOT_FOUND');
    });

    it('rejects inactive services and blocked clients', async () => {
      await expectAppError(create({ serviceId: s.inactive.id }), 'RULE_VIOLATION', 'SERVICE_INACTIVE');
      s.repo.tables.clients.find((c) => c.id === s.client.id)!.is_blocked = true;
      await expectAppError(create(), 'RULE_VIOLATION', 'CLIENT_BLOCKED');
    });

    it('rejects an unparseable start', async () => {
      await expectAppError(create({ startsAt: 'tomorrow' }), 'VALIDATION_FAILED');
    });

    it('replays an idempotency key without re-validating or re-notifying', async () => {
      const a = await create({ idempotencyKey: 'wa:abc' });
      const b = await create({ idempotencyKey: 'wa:abc' });
      expect(b).toEqual(a);
      expect(s.repo.tables.appointments).toHaveLength(1);
      expect(events).toHaveLength(1);
    });

    it('lets staff book walk-ins outside hours, still enforcing overlap', async () => {
      const walkIn = await create({ startsAt: sast('18:00'), allowOutsideHours: true });
      expect(walkIn.staff_id).toBe(s.thandi.id);
      const second = await create({ startsAt: sast('18:30'), allowOutsideHours: true });
      expect(second.staff_id).toBe(s.sipho.id);
      await expectAppError(create({ startsAt: sast('18:30'), allowOutsideHours: true }), 'SLOT_UNAVAILABLE');
      await expectAppError(create({ startsAt: sast('18:30'), staffId: s.thandi.id, allowOutsideHours: true }), 'SLOT_UNAVAILABLE');
    });

    it('ignores allowOutsideHours for customers', async () => {
      await expectAppError(
        create({ startsAt: sast('18:00'), allowOutsideHours: true, actor: { type: 'customer', id: s.client.id } }),
        'SLOT_UNAVAILABLE',
      );
    });

    it('maps a lost race at the database to SLOT_UNAVAILABLE', async () => {
      await create({ staffId: s.thandi.id });
      const listBusy = vi.spyOn(s.repo, 'listBusy').mockResolvedValue([]);
      await expectAppError(create({ staffId: s.thandi.id }), 'SLOT_UNAVAILABLE');
      expect(listBusy).toHaveBeenCalled();
    });

    it('never fails the booking when notification fails', async () => {
      const failing = createBookingServiceFromRepository({
        repository: s.repo,
        notifications: { appointmentChanged: async () => Promise.reject(new Error('meta down')) },
        logger: silentLogger,
        clock: () => NOW,
      });
      const appt = await failing.createAppointment({
        businessId: s.business.id,
        clientId: s.client.id,
        serviceId: s.cut.id,
        startsAt: sast('09:00'),
        source: 'whatsapp',
        idempotencyKey: 'wa:fail',
        actor: { type: 'customer', id: s.client.id },
      });
      expect(appt.status).toBe('confirmed');
    });
  });

  describe('rescheduleAppointment', () => {
    it('moves the booking, keeping the current staff when free', async () => {
      const appt = await create({ staffId: s.sipho.id });
      const moved = await booking.rescheduleAppointment({
        businessId: s.business.id,
        appointmentId: appt.id,
        startsAt: sast('09:30'),
        actor: staffActor,
        notifyCustomer: true,
      });
      expect(moved).toMatchObject({ staff_id: s.sipho.id, starts_at: sast('09:30'), ends_at: sast('10:30') });
      expect(events.at(-1)).toMatchObject({ kind: 'rescheduled', appointmentId: appt.id, notifyCustomer: true });
      expect(s.repo.tables.appointment_events.at(-1)).toMatchObject({ type: 'rescheduled' });
    });

    it('re-resolves staff when the current one is busy, or uses an explicit one', async () => {
      const appt = await create({ staffId: s.sipho.id });
      await create({ staffId: s.sipho.id, startsAt: sast('14:00') });
      const moved = await booking.rescheduleAppointment({
        businessId: s.business.id,
        appointmentId: appt.id,
        startsAt: sast('14:00'),
        actor: staffActor,
      });
      expect(moved.staff_id).toBe(s.thandi.id);
      await expectAppError(
        booking.rescheduleAppointment({
          businessId: s.business.id,
          appointmentId: appt.id,
          startsAt: sast('14:30'),
          staffId: s.sipho.id,
          actor: staffActor,
        }),
        'SLOT_UNAVAILABLE',
      );
    });

    it('holds customers to the cancellation window and to their own bookings', async () => {
      const appt = await create();
      const customer: Actor = { type: 'customer', id: s.client.id };
      // 09:00 Wed is 49h after NOW: outside a 24h window → allowed
      await booking.rescheduleAppointment({ businessId: s.business.id, appointmentId: appt.id, startsAt: sast('10:00'), actor: customer });
      // inside a 72h window → refused
      s.business.booking_rules = { ...s.business.booking_rules, cancellation_window_minutes: 72 * 60 };
      await expectAppError(
        booking.rescheduleAppointment({ businessId: s.business.id, appointmentId: appt.id, startsAt: sast('11:00'), actor: customer }),
        'RULE_VIOLATION',
        'CANCELLATION_WINDOW',
      );
      // staff are not held to it
      await booking.rescheduleAppointment({ businessId: s.business.id, appointmentId: appt.id, startsAt: sast('11:00'), actor: staffActor });
      await expectAppError(
        booking.rescheduleAppointment({
          businessId: s.business.id,
          appointmentId: appt.id,
          startsAt: sast('13:00'),
          actor: { type: 'customer', id: s.other.id },
        }),
        'NOT_FOUND',
      );
    });

    it('refuses non-confirmed appointments', async () => {
      const appt = await create();
      await booking.cancelAppointment({ businessId: s.business.id, appointmentId: appt.id, actor: staffActor });
      await expectAppError(
        booking.rescheduleAppointment({ businessId: s.business.id, appointmentId: appt.id, startsAt: sast('10:00'), actor: staffActor }),
        'RULE_VIOLATION',
        'INVALID_STATUS',
      );
    });

    it('lets staff move a booking outside hours', async () => {
      const appt = await create();
      const moved = await booking.rescheduleAppointment({
        businessId: s.business.id,
        appointmentId: appt.id,
        startsAt: sast('19:00'),
        actor: staffActor,
        allowOutsideHours: true,
      });
      expect(moved.starts_at).toBe(sast('19:00'));
    });
  });

  describe('cancelAppointment', () => {
    it('cancels and frees the slot', async () => {
      const appt = await create({ staffId: s.thandi.id });
      const cancelled = await booking.cancelAppointment({
        businessId: s.business.id,
        appointmentId: appt.id,
        actor: staffActor,
        reason: 'Sick',
      });
      expect(cancelled).toMatchObject({ status: 'cancelled', cancel_reason: 'Sick' });
      expect(cancelled.cancelled_at).toBe(NOW.toISOString());
      expect(events.at(-1)).toMatchObject({ kind: 'cancelled', notifyCustomer: false });
      const again = await create({ staffId: s.thandi.id });
      expect(again.starts_at).toBe(sast('09:00'));
    });

    it('holds customers to the cancellation window', async () => {
      s.business.booking_rules = { ...s.business.booking_rules, cancellation_window_minutes: 72 * 60 };
      const appt = await create();
      await expectAppError(
        booking.cancelAppointment({ businessId: s.business.id, appointmentId: appt.id, actor: { type: 'customer', id: s.client.id } }),
        'RULE_VIOLATION',
        'CANCELLATION_WINDOW',
      );
    });

    it('maps a second cancel to INVALID_STATUS', async () => {
      const appt = await create();
      await booking.cancelAppointment({ businessId: s.business.id, appointmentId: appt.id, actor: staffActor });
      await expectAppError(
        booking.cancelAppointment({ businessId: s.business.id, appointmentId: appt.id, actor: staffActor }),
        'RULE_VIOLATION',
        'INVALID_STATUS',
      );
    });
  });

  describe('reads', () => {
    it('gets an appointment scoped to the business', async () => {
      const appt = await create();
      expect(await booking.getAppointment(s.business.id, appt.id)).toEqual(appt);
      expect(await booking.getAppointment('00000000-0000-4000-8000-999999999999', appt.id)).toBeNull();
    });

    it('lists upcoming confirmed appointments for a client, ascending', async () => {
      const later = await create({ startsAt: sast('14:00') });
      const sooner = await create({ startsAt: sast('09:00') });
      const gone = await create({ startsAt: sast('10:00'), staffId: s.sipho.id });
      await booking.cancelAppointment({ businessId: s.business.id, appointmentId: gone.id, actor: staffActor });
      const list = await booking.listUpcomingForClient(s.business.id, s.client.id, NOW);
      expect(list.map((a) => a.id)).toEqual([sooner.id, later.id]);
      expect(await booking.listUpcomingForClient(s.business.id, s.client.id, new Date(sast('10:00')))).toHaveLength(1);
    });
  });
});
