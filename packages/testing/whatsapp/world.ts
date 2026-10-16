/** Fixed ids, a small in-memory "world" and a fake BookingService over it. */
import { randomUUID } from 'node:crypto';

import type { AppointmentDTO, BookingRules, BusinessDTO, ServiceDTO, SlotDTO, StaffDTO } from '@booking/types';
import { AppError, ruleViolation } from '@booking/features/lib/errors.ts';
import type { BookingService } from '@booking/features/ports.ts';

// ---------------------------------------------------------------- fixed ids

export const BIZ = '00000000-0000-4000-8000-000000000b12';
export const ACCOUNT_ID = '00000000-0000-4000-8000-0000000000a1';
export const PHONE_NUMBER_ID = '111222333';
export const WABA_ID = '999888777';
export const SVC_CUT = '00000000-0000-4000-8000-00000000c001';
export const SVC_COLOUR = '00000000-0000-4000-8000-00000000c002';
export const STAFF_SAM = '00000000-0000-4000-8000-00000000d001';
export const STAFF_ALEX = '00000000-0000-4000-8000-00000000d002';
export const CUSTOMER_PHONE = '+27821234567';
export const CUSTOMER_WA = '27821234567';

export const NOW = new Date('2026-09-28T08:00:00.000Z'); // Mon 10:00 in Johannesburg

export const RULES: BookingRules = {
  lead_time_minutes: 60,
  cancellation_window_minutes: 1440,
  buffer_minutes: 0,
  slot_interval_minutes: 15,
  booking_horizon_days: 60,
  reminder_offsets_minutes: [1440, 120],
  allow_staff_selection: true,
};

export function service(id: string, name: string, extra: Partial<ServiceDTO> = {}): ServiceDTO {
  return {
    id,
    name,
    description: null,
    category: null,
    duration_minutes: 60,
    price_cents: 25000,
    deposit_cents: 0,
    is_active: true,
    sort_order: 0,
    ...extra,
  };
}

export function staff(id: string, name: string): StaffDTO {
  return {
    id,
    user_id: null,
    name,
    title: null,
    photo_url: null,
    phone: null,
    email: null,
    color: null,
    is_active: true,
    accepts_bookings: true,
    sort_order: 0,
  };
}

export const uuidN = (n: number, prefix = 'e') => `00000000-0000-4000-8000-${prefix}${String(n).padStart(11, '0')}`;

// ---------------------------------------------------------------- world + fake booking

export interface World {
  business: BusinessDTO;
  services: ServiceDTO[];
  staff: StaffDTO[];
  /** service id → staff ids */
  staffServices: Record<string, string[]>;
  days: string[];
  /** date → slots */
  slots: Record<string, SlotDTO[]>;
  appointments: AppointmentDTO[];
  /** starts_at values that throw SLOT_UNAVAILABLE on create/reschedule */
  taken: Set<string>;
  calls: { method: string; args: unknown }[];
}

export function slot(startsAt: string, staffIds: string[] = [STAFF_SAM, STAFF_ALEX]): SlotDTO {
  return { starts_at: startsAt, ends_at: new Date(Date.parse(startsAt) + 3600_000).toISOString(), staff_ids: staffIds };
}

export function makeWorld(over: Partial<World> = {}): World {
  return {
    business: {
      id: BIZ,
      name: 'Nadia Hair',
      slug: 'nadia-hair',
      timezone: 'Africa/Johannesburg',
      currency: 'ZAR',
      logo_url: null,
      address: null,
      phone: null,
      email: null,
      booking_rules: { ...RULES },
      attendance_mode: 'staff',
    },
    services: [service(SVC_CUT, 'Haircut'), service(SVC_COLOUR, 'Colour', { price_cents: 0, duration_minutes: 90 })],
    staff: [staff(STAFF_SAM, 'Sam'), staff(STAFF_ALEX, 'Alex')],
    staffServices: { [SVC_CUT]: [STAFF_SAM, STAFF_ALEX], [SVC_COLOUR]: [STAFF_SAM] },
    days: ['2026-09-29', '2026-09-30', '2026-10-01'],
    slots: {
      '2026-09-29': [slot('2026-09-29T07:00:00.000Z'), slot('2026-09-29T08:00:00.000Z', [STAFF_SAM])],
      '2026-09-30': [slot('2026-09-30T07:00:00.000Z')],
      '2026-10-01': [slot('2026-10-01T07:00:00.000Z')],
    },
    appointments: [],
    taken: new Set(),
    calls: [],
    ...over,
  };
}

export function appointment(over: Partial<AppointmentDTO> & { id: string; client_id: string; starts_at: string }): AppointmentDTO {
  return {
    business_id: BIZ,
    staff_id: STAFF_SAM,
    service_id: SVC_CUT,
    ends_at: new Date(Date.parse(over.starts_at) + 3600_000).toISOString(),
    status: 'confirmed',
    source: 'whatsapp',
    price_cents: 25000,
    duration_minutes: 60,
    notes: null,
    checked_in_at: null,
    client_confirmed_at: null,
    client_confirmed_via: null,
    cancelled_at: null,
    cancel_reason: null,
    created_at: NOW.toISOString(),
    ...over,
  };
}

export function fakeBooking(world: World): BookingService {
  const log = (method: string, args: unknown) => world.calls.push({ method, args });
  const windowCheck = (appt: AppointmentDTO, actorType: string, now: Date) => {
    if (actorType !== 'customer') return;
    const mins = (Date.parse(appt.starts_at) - now.getTime()) / 60_000;
    if (mins < world.business.booking_rules.cancellation_window_minutes) {
      throw ruleViolation('CANCELLATION_WINDOW', 'Too late to change');
    }
  };
  return {
    async getBusiness() {
      return world.business;
    },
    async listServices() {
      return world.services.filter((s) => s.is_active);
    },
    async listBookableStaff(_b, serviceId) {
      const ids = world.staffServices[serviceId] ?? [];
      return world.staff.filter((s) => ids.includes(s.id));
    },
    async listAppointments() {
      return [];
    },
    async listAvailableDays(q) {
      log('listAvailableDays', q);
      return world.days.filter((d) => d >= q.from && d <= q.to);
    },
    async listAvailableSlots(q) {
      log('listAvailableSlots', q);
      const slots = (world.slots[q.date] ?? []).filter((s) => !q.staffId || s.staff_ids.includes(q.staffId));
      return { date: q.date, timezone: world.business.timezone, slots };
    },
    async listAvailableSlotsForRange(q) {
      log('listAvailableSlotsForRange', q);
      const out = [];
      for (let d = q.from; d <= q.to; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) {
        const slots = (world.slots[d] ?? []).filter((s) => !q.staffId || s.staff_ids.includes(q.staffId));
        out.push({ date: d, timezone: world.business.timezone, slots });
      }
      return out;
    },
    async createAppointment(input) {
      log('createAppointment', input);
      const existing = world.appointments.find((a) => (a as AppointmentDTO & { key?: string }).key === input.idempotencyKey);
      if (existing) return existing;
      if (world.taken.has(input.startsAt)) throw new AppError('SLOT_UNAVAILABLE', 'taken');
      const slotStaff = world.slots[input.startsAt.slice(0, 10)]?.find((s) => s.starts_at === input.startsAt)?.staff_ids[0];
      const appt = appointment({
        id: randomUUID(),
        client_id: input.clientId,
        service_id: input.serviceId,
        staff_id: input.staffId ?? slotStaff ?? STAFF_SAM,
        starts_at: input.startsAt,
      });
      world.appointments.push(Object.assign(appt, { key: input.idempotencyKey }));
      return appt;
    },
    async confirmByClient(input) {
      log('confirmByClient', input);
      const appt = world.appointments.find((a) => a.id === input.appointmentId);
      if (!appt) throw new AppError('NOT_FOUND', 'nope');
      if (appt.status === 'confirmed' && !appt.client_confirmed_at) {
        appt.client_confirmed_at = input.confirmedAt;
        appt.client_confirmed_via = input.via;
      }
      return appt;
    },
    async rescheduleAppointment(input) {
      log('rescheduleAppointment', input);
      const appt = world.appointments.find((a) => a.id === input.appointmentId);
      if (!appt) throw new AppError('NOT_FOUND', 'nope');
      windowCheck(appt, input.actor.type, input.now ?? new Date());
      if (world.taken.has(input.startsAt)) throw new AppError('SLOT_UNAVAILABLE', 'taken');
      appt.starts_at = input.startsAt;
      appt.ends_at = new Date(Date.parse(input.startsAt) + 3600_000).toISOString();
      if (input.staffId) appt.staff_id = input.staffId;
      return { ...appt };
    },
    async cancelAppointment(input) {
      log('cancelAppointment', input);
      const appt = world.appointments.find((a) => a.id === input.appointmentId);
      if (!appt) throw new AppError('NOT_FOUND', 'nope');
      windowCheck(appt, input.actor.type, input.now ?? new Date());
      appt.status = 'cancelled';
      return { ...appt };
    },
    async getAppointment(_b, id) {
      const a = world.appointments.find((x) => x.id === id);
      return a ? { ...a } : null;
    },
    async setAppointmentStatus() {
      throw new Error('the WhatsApp channel never sets appointment status');
    },
    async listUpcomingForClient(_b, clientId, now) {
      return world.appointments
        .filter((a) => a.client_id === clientId && a.status === 'confirmed' && Date.parse(a.starts_at) > (now ?? new Date()).getTime())
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    },
  };
}

