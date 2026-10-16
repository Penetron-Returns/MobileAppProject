import { createMemoryRepository, type MemoryRepository } from '@booking/testing/bookingMemoryRepository.ts';
import { DEFAULT_BOOKING_RULES, type AppointmentRow, type BusinessRow, type ClientRow } from '@booking/features/repositories/rows.ts';

/** Tuesday 2026-10-13 12:00 SAST */
export const NOW = new Date('2026-10-13T10:00:00.000Z');
export const DAY = 24 * 60 * 60 * 1000;

export function vocabularyRepo(businessId: string): { repo: MemoryRepository; business: BusinessRow } {
  const repo = createMemoryRepository({ now: () => NOW });
  const business: BusinessRow = {
    id: businessId,
    clerk_org_id: `org_${businessId}`,
    name: 'Salon',
    slug: `salon-${businessId.slice(-4)}`,
    timezone: 'Africa/Johannesburg',
    currency: 'ZAR',
    logo_url: null,
    address: null,
    phone: null,
    email: null,
    booking_rules: { ...DEFAULT_BOOKING_RULES },
    attendance_mode: 'staff',
  };
  repo.tables.businesses.push(business);
  return { repo, business };
}

export function addClient(repo: MemoryRepository, businessId: string, name: string | null): ClientRow {
  const row: ClientRow = {
    id: repo.nextId(),
    business_id: businessId,
    phone_e164: `+2782${String(repo.tables.clients.length).padStart(7, '0')}`,
    name,
    email: null,
    notes: null,
    tags: [],
    is_blocked: false,
    whatsapp_opt_in: true,
    first_seen_at: NOW.toISOString(),
    last_seen_at: null,
  };
  repo.tables.clients.push(row);
  return row;
}

/** An appointment starting `offsetMs` from NOW (negative = past). */
export function addAppointment(
  repo: MemoryRepository,
  businessId: string,
  clientId: string,
  offsetMs: number,
  status: AppointmentRow['status'] = 'confirmed',
): void {
  const start = new Date(NOW.getTime() + offsetMs).toISOString();
  const end = new Date(NOW.getTime() + offsetMs + 3_600_000).toISOString();
  const range = `["${start}","${end}")`;
  repo.tables.appointments.push({
    id: repo.nextId(),
    business_id: businessId,
    client_id: clientId,
    staff_id: repo.nextId(),
    service_id: repo.nextId(),
    slot: range,
    blocked: range,
    status,
    source: 'app',
    price_cents: 0,
    duration_minutes: 60,
    notes: null,
    idempotency_key: null,
    checked_in_at: null,
    client_confirmed_at: null,
    client_confirmed_via: null,
    cancelled_at: null,
    cancel_reason: null,
    created_by: null,
    created_at: start,
  });
}
