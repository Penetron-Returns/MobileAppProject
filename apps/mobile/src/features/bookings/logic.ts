import type {
  AppointmentStatus,
  CancelAppointmentRequest,
  CreateAppointmentRequest,
  RescheduleAppointmentRequest,
  SlotDTO,
} from '@shared/api';

import { addDays, toDate, type ISODate } from '@/lib/time';

/** Used when the business has no `cancellation_window_minutes` rule readable. */
export const DEFAULT_CANCELLATION_WINDOW_MINUTES = 1440;
export const CLOSEST_SLOT_COUNT = 3;

// ---------- new booking ----------

export interface BookingForm {
  clientMode: 'existing' | 'new';
  clientId: string | null;
  newClientName: string;
  newClientPhone: string;
  serviceId: string | null;
  /** null = "Any": the engine picks the staff member. */
  staffId: string | null;
  startsAt: string | null;
  notes: string;
  sendWhatsApp: boolean;
}

export type BookingFormError = 'client' | 'newClient' | 'service' | 'slot';

/** Validates the new-booking form and shapes the API request. */
export function toCreateRequest(
  form: BookingForm,
):
  | { ok: true; request: CreateAppointmentRequest }
  | { ok: false; error: BookingFormError } {
  const client =
    form.clientMode === 'existing'
      ? form.clientId
        ? { client_id: form.clientId }
        : null
      : form.newClientName.trim() && form.newClientPhone.trim()
        ? {
            new_client: {
              name: form.newClientName.trim(),
              phone: form.newClientPhone.trim(),
            },
          }
        : null;
  if (!client) {
    return {
      ok: false,
      error: form.clientMode === 'existing' ? 'client' : 'newClient',
    };
  }
  if (!form.serviceId) return { ok: false, error: 'service' };
  if (!form.startsAt) return { ok: false, error: 'slot' };
  return {
    ok: true,
    request: {
      ...client,
      service_id: form.serviceId,
      staff_id: form.staffId,
      starts_at: form.startsAt,
      notes: form.notes.trim() || null,
      send_whatsapp_confirmation: form.sendWhatsApp,
    },
  };
}

/** Staff who are active, bookable and qualified for the service. */
export function bookableStaff<
  T extends { id: string; is_active: boolean; accepts_bookings: boolean },
>(
  staff: T[],
  links: { staff_id: string; service_id: string }[],
  serviceId: string | null,
): T[] {
  if (!serviceId) return [];
  const qualified = new Set(
    links.filter((l) => l.service_id === serviceId).map((l) => l.staff_id),
  );
  return staff.filter(
    (s) => s.is_active && s.accepts_bookings && qualified.has(s.id),
  );
}

// ---------- live slots ----------

/** The day to show: the wanted one if bookable, else the first bookable day after it, else the first. */
export function pickDay(
  days: ISODate[],
  wanted: ISODate | null,
): ISODate | null {
  if (days.length === 0) return null;
  if (wanted && days.includes(wanted)) return wanted;
  const after = wanted ? days.find((d) => d >= wanted) : undefined;
  return after ?? days[0];
}

/**
 * The slots nearest in time to `target`, earliest first. This feeds the
 * "just taken" card: the booked slot is gone, so offer what is closest.
 */
export function closestSlots(
  slots: SlotDTO[],
  target: string,
  count = CLOSEST_SLOT_COUNT,
): SlotDTO[] {
  const at = toDate(target).getTime();
  const distance = (s: SlotDTO) => Math.abs(toDate(s.starts_at).getTime() - at);
  return [...slots]
    .sort(
      (a, b) =>
        distance(a) - distance(b) || a.starts_at.localeCompare(b.starts_at),
    )
    .slice(0, count)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/** The staff member a slot would book: the one named, else the engine's first pick. */
export function slotStaffId(
  slot: SlotDTO,
  chosenStaffId: string | null,
): string | null {
  return chosenStaffId ?? slot.staff_ids[0] ?? null;
}

/** The bookable window the day chips cover: today for `horizonDays` days. */
export function dayRange(
  today: ISODate,
  horizonDays: number,
): { from: ISODate; to: ISODate } {
  return { from: today, to: addDays(today, Math.max(horizonDays, 0)) };
}

// ---------- reschedule ----------

export function toRescheduleRequest(opts: {
  startsAt: string | null;
  staffId: string | null;
  notifyCustomer: boolean;
}): RescheduleAppointmentRequest | null {
  if (!opts.startsAt) return null;
  return {
    starts_at: opts.startsAt,
    staff_id: opts.staffId,
    notify_customer: opts.notifyCustomer,
  };
}

// ---------- cancel ----------

export type CancelReason = 'client' | 'staff' | 'other';

/** The reason text sent to the API, or null when "Other" has no text. */
export function cancelReasonText(
  reason: CancelReason,
  labels: Record<Exclude<CancelReason, 'other'>, string>,
  otherText: string,
): string | null {
  if (reason === 'other') return otherText.trim() || null;
  return labels[reason];
}

export function toCancelRequest(
  reasonText: string | null,
  notifyCustomer: boolean,
): CancelAppointmentRequest {
  return { reason: reasonText, notify_customer: notifyCustomer };
}

/** Reads `cancellation_window_minutes` out of the business `booking_rules` JSON. */
export function cancellationWindowMinutes(rules: unknown): number {
  if (rules && typeof rules === 'object' && !Array.isArray(rules)) {
    const value = (rules as Record<string, unknown>)
      .cancellation_window_minutes;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return value;
    }
  }
  return DEFAULT_CANCELLATION_WINDOW_MINUTES;
}

/** True when cancelling now falls inside the cancellation window before the start. */
export function isLateCancellation(
  startsAt: string,
  now: Date,
  windowMinutes: number,
): boolean {
  return toDate(startsAt).getTime() - now.getTime() < windowMinutes * 60_000;
}

/** Window in hours for the notice ("within 24 hours"), rounded up. */
export function windowHours(windowMinutes: number): number {
  return Math.max(1, Math.ceil(windowMinutes / 60));
}

// ---------- booking detail ----------

export type PrimaryAction = 'checkIn' | 'checkOut' | 'none';

/** What the main button does: check in, then check out (status `completed`). */
export function primaryAction(a: {
  status: AppointmentStatus;
  checked_in_at: string | null;
}): PrimaryAction {
  if (a.status !== 'confirmed') return 'none';
  return a.checked_in_at ? 'checkOut' : 'checkIn';
}

/** Only a confirmed booking can be moved, cancelled or marked no-show. */
export function canChange(status: AppointmentStatus): boolean {
  return status === 'confirmed';
}

/** Capsule shown only for exceptions (SOFT.md); null for ordinary bookings. */
export function statusCapsule(
  status: AppointmentStatus,
): 'cancelled' | 'no_show' | null {
  return status === 'cancelled' || status === 'no_show' ? status : null;
}

export function dayRelation(
  date: ISODate,
  today: ISODate,
): 'today' | 'tomorrow' | 'other' {
  if (date === today) return 'today';
  return addDays(today, 1) === date ? 'tomorrow' : 'other';
}

export const DEFAULT_HORIZON_DAYS = 60;

/** Reads `booking_horizon_days` out of the business `booking_rules` JSON. */
export function bookingHorizonDays(rules: unknown): number {
  if (rules && typeof rules === 'object' && !Array.isArray(rules)) {
    const value = (rules as Record<string, unknown>).booking_horizon_days;
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }
  }
  return DEFAULT_HORIZON_DAYS;
}

/** Lifecycle event types that read well in the History list. */
export const HISTORY_EVENTS = [
  'created',
  'confirmation_sent',
  'reminder_sent',
  'checked_in',
  'rescheduled',
  'completed',
  'no_show',
  'cancelled',
  'notes_updated',
] as const;
