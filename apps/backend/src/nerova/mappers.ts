/** Internal rows/DTOs → Nerova Booking connector wire shapes (camelCase, integer cents, UTC instants). */
import type { AppointmentDTO, AppointmentStatus, BusinessDTO, ServiceDTO } from '../../../../packages/shared/api.ts';
import type { BusinessHoursDbRow, ClientRow, OverrideRow, StaffRow } from '../booking/rows.ts';
import { normaliseTimeOfDay } from '../lib/time.ts';

export type WireStatus = 'Scheduled' | 'Completed' | 'Cancelled' | 'NoShow';

const WIRE_BY_STATUS: Record<AppointmentStatus, WireStatus> = {
  confirmed: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'NoShow',
};
export const toWireStatus = (status: AppointmentStatus): WireStatus => WIRE_BY_STATUS[status];
export const fromWireStatus = (status: WireStatus): AppointmentStatus =>
  (Object.entries(WIRE_BY_STATUS).find(([, wire]) => wire === status)?.[0] ?? 'confirmed') as AppointmentStatus;

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

interface Range {
  open: string;
  close: string;
}

/** Closing time of a range that ends at midnight is "24:00" in our data; the contract wants HH:mm. */
const clock = (value: string) => {
  const t = normaliseTimeOfDay(value);
  return t === '24:00' ? '23:59' : t;
};

/** One location (the business itself): the weekly schedule plus business-wide date exceptions. */
export function toOpeningHours(locationId: string, hours: BusinessHoursDbRow[], overrides: OverrideRow[]) {
  const weekly = DAYS.map((day, weekday) => ({
    day,
    ranges: hours
      .filter((h) => h.weekday === weekday)
      .sort((a, b) => a.opens_at.localeCompare(b.opens_at))
      .map((h): Range => ({ open: clock(h.opens_at), close: clock(h.closes_at) })),
  }));
  const exceptions = overrides
    .filter((o) => o.staff_id === null)
    .map((o) => ({
      date: o.date,
      externalLocationId: locationId,
      ranges: o.is_closed || !o.start_time || !o.end_time ? [] : [{ open: clock(o.start_time), close: clock(o.end_time) }],
      ...(o.reason ? { reason: o.reason } : {}),
    }));
  return { weekly: [{ externalLocationId: locationId, days: weekly }], exceptions };
}

export function toAccount(business: BusinessDTO, openingHours: ReturnType<typeof toOpeningHours>) {
  return {
    id: business.id,
    displayName: business.name,
    timeZone: business.timezone,
    currency: business.currency,
    // Single-location model: the business is its own location.
    locations: [{ id: business.id, name: business.name }],
    openingHours,
  };
}

export function toService(service: ServiceDTO, currency: string) {
  return {
    externalServiceId: service.id,
    name: service.name,
    durationMinutes: service.duration_minutes,
    price: { amountCents: service.price_cents, currency },
    ...(service.category ? { category: service.category } : {}),
    ...(service.description ? { description: service.description } : {}),
  };
}

export function toStaff(staff: StaffRow, serviceIds: string[]) {
  return { externalStaffId: staff.id, name: staff.name, externalServiceIds: serviceIds };
}

export function toAppointment(appt: AppointmentDTO) {
  return {
    externalAppointmentId: appt.id,
    externalServiceId: appt.service_id,
    externalStaffId: appt.staff_id,
    externalClientId: appt.client_id,
    externalLocationId: appt.business_id,
    startTime: appt.starts_at,
    endTime: appt.ends_at,
    status: toWireStatus(appt.status),
    ...(appt.notes ? { notes: appt.notes } : {}),
  };
}

export interface AppointmentLookups {
  services: Map<string, string>;
  staff: Map<string, string>;
  clients: Map<string, ClientRow>;
}

export function toAppointmentListItem(appt: AppointmentDTO, lookups: AppointmentLookups) {
  const client = lookups.clients.get(appt.client_id);
  return {
    ...toAppointment(appt),
    serviceName: lookups.services.get(appt.service_id) ?? '',
    staffName: lookups.staff.get(appt.staff_id) ?? '',
    ...(client?.name ? { clientName: client.name } : {}),
    ...(client ? { clientPhone: client.phone_e164 } : {}),
  };
}
