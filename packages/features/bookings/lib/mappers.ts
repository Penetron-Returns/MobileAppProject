/** Row → DTO mapping (@booking/types shapes). */
import type {
  AppointmentDTO,
  BookingRules,
  BusinessDTO,
  BusinessHoursRow,
  ClientDTO,
  ClientNoteDTO,
  ServiceDTO,
  StaffDTO,
} from '@booking/types';
import { normaliseTimeOfDay, rangeBounds, toIsoInstant } from '../../lib/time.ts';
import {
  DEFAULT_BOOKING_RULES,
  type AppointmentRow,
  type BusinessHoursDbRow,
  type BusinessRow,
  type ClientNoteRow,
  type ClientRow,
  type ServiceRow,
  type StaffRow,
} from '../../repositories/rows.ts';

const iso = (v: string | null) => (v === null ? null : toIsoInstant(v));

/** Stored rules merged over the defaults so older rows never miss a key. */
export function bookingRules(row: Pick<BusinessRow, 'booking_rules'>): BookingRules {
  return { ...DEFAULT_BOOKING_RULES, ...(row.booking_rules ?? {}) };
}

export function toBusinessDTO(row: BusinessRow): BusinessDTO {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    timezone: row.timezone,
    currency: row.currency.trim(),
    logo_url: row.logo_url,
    address: row.address,
    phone: row.phone,
    email: row.email,
    booking_rules: bookingRules(row),
    attendance_mode: row.attendance_mode,
  };
}

export function toBusinessHours(row: BusinessHoursDbRow): BusinessHoursRow {
  return { weekday: row.weekday, opens_at: normaliseTimeOfDay(row.opens_at), closes_at: normaliseTimeOfDay(row.closes_at) };
}

export function toServiceDTO(row: ServiceRow): ServiceDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    duration_minutes: row.duration_minutes,
    price_cents: row.price_cents,
    deposit_cents: row.deposit_cents,
    is_active: row.is_active,
    sort_order: row.sort_order,
  };
}

export function toStaffDTO(row: StaffRow): StaffDTO {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    title: row.title,
    photo_url: row.photo_url,
    phone: row.phone,
    email: row.email,
    color: row.color,
    is_active: row.is_active,
    accepts_bookings: row.accepts_bookings,
    sort_order: row.sort_order,
  };
}

export function toClientDTO(row: ClientRow): ClientDTO {
  return {
    id: row.id,
    phone_e164: row.phone_e164,
    name: row.name,
    email: row.email,
    notes: row.notes,
    tags: row.tags ?? [],
    is_blocked: row.is_blocked,
    whatsapp_opt_in: row.whatsapp_opt_in,
    first_seen_at: toIsoInstant(row.first_seen_at),
    last_seen_at: iso(row.last_seen_at),
  };
}

export function toClientNoteDTO(row: ClientNoteRow): ClientNoteDTO {
  return {
    id: row.id,
    client_id: row.client_id,
    body: row.body,
    kind: row.kind,
    created_by: row.created_by,
    created_at: toIsoInstant(row.created_at),
  };
}

export function toAppointmentDTO(row: AppointmentRow): AppointmentDTO {
  const { start, end } = rangeBounds(row.slot);
  return {
    id: row.id,
    business_id: row.business_id,
    client_id: row.client_id,
    staff_id: row.staff_id,
    service_id: row.service_id,
    starts_at: start,
    ends_at: end,
    status: row.status,
    source: row.source,
    price_cents: row.price_cents,
    duration_minutes: row.duration_minutes,
    notes: row.notes,
    checked_in_at: iso(row.checked_in_at),
    client_confirmed_at: iso(row.client_confirmed_at),
    client_confirmed_via: row.client_confirmed_via,
    cancelled_at: iso(row.cancelled_at),
    cancel_reason: row.cancel_reason,
    created_at: toIsoInstant(row.created_at),
  };
}
