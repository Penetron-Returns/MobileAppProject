/** Today's appointments for the voice check-in: minimal fields, business-local day, no phone numbers. */
import type { UUID } from '@booking/types';
import { dateInZone, dayBoundsInZone, rangeBounds } from '../../lib/time.ts';
import { notFound } from '../../lib/errors.ts';
import type { BookingRepository } from '../../repositories/types.ts';

export interface VoiceTodayAppointment {
  id: UUID;
  starts_at: string;
  ends_at: string;
  status: string;
  checked_in_at: string | null;
  staff_id: UUID;
  /** First name only: enough to match "Sipho has arrived", never a surname or number. */
  client_first_name: string | null;
  service_name: string | null;
}

export interface VoiceToday {
  timezone: string;
  appointments: VoiceTodayAppointment[];
}

const MAX_ROWS = 200;

export async function listVoiceToday(repo: BookingRepository, businessId: UUID, now: Date): Promise<VoiceToday> {
  const business = await repo.getBusiness(businessId);
  if (!business) throw notFound('Business');
  const { start, end } = dayBoundsInZone(dateInZone(now, business.timezone), business.timezone);
  const rows = (
    await repo.listAppointmentsInWindow(businessId, {
      fromIso: new Date(start).toISOString(),
      toIso: new Date(end).toISOString(),
      limit: MAX_ROWS,
    })
  ).filter((a) => a.status !== 'cancelled');
  const [clients, services] = await Promise.all([
    repo.listClientsByIds(businessId, [...new Set(rows.map((a) => a.client_id))]),
    repo.listServices(businessId),
  ]);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const serviceName = new Map(services.map((s) => [s.id, s.name]));
  return {
    timezone: business.timezone,
    appointments: rows.map((a) => {
      const { start: startsAt, end: endsAt } = rangeBounds(a.slot);
      return {
        id: a.id,
        starts_at: startsAt,
        ends_at: endsAt,
        status: a.status,
        checked_in_at: a.checked_in_at,
        staff_id: a.staff_id,
        client_first_name: clientName.get(a.client_id)?.trim().split(/\s+/)[0] || null,
        service_name: serviceName.get(a.service_id) ?? null,
      };
    }),
  };
}
