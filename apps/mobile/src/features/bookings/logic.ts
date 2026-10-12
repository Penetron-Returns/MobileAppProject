import type { CreateAppointmentRequest } from '@shared/api';

import { addDays, type ISODate } from '@/lib/time';

export const BOOKING_DAYS_SHOWN = 14;

export function upcomingDates(
  today: ISODate,
  count = BOOKING_DAYS_SHOWN,
): ISODate[] {
  return Array.from({ length: count }, (_, i) => addDays(today, i));
}

export interface BookingForm {
  clientMode: 'existing' | 'new';
  clientId: string | null;
  newClientName: string;
  newClientPhone: string;
  serviceId: string | null;
  staffId: string | null;
  startsAt: string | null;
  notes: string;
  sendWhatsApp: boolean;
}

export type BookingFormError = 'client' | 'newClient' | 'service' | 'slot';

/** Validates the add-booking form and shapes the API request. */
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
