import { createMemoryRepository, type MemoryRepository } from '../../src/booking/memoryRepository.ts';
import { DEFAULT_BOOKING_RULES, type BusinessRow, type ClientRow, type ServiceRow, type StaffRow } from '../../src/booking/rows.ts';
import type { BookingRules } from '../../../shared/api.ts';

/** Monday 2026-09-28 08:00 SAST. */
export const NOW = new Date('2026-09-28T06:00:00.000Z');
/** Wednesday */
export const WED = '2026-09-30';

/** ISO instant for a SAST wall-clock time. */
export const sast = (hhmm: string, date = WED) => new Date(`${date}T${hhmm}:00+02:00`).toISOString();

export interface Seed {
  repo: MemoryRepository;
  business: BusinessRow;
  cut: ServiceRow;
  colour: ServiceRow;
  inactive: ServiceRow;
  thandi: StaffRow;
  sipho: StaffRow;
  off: StaffRow;
  client: ClientRow;
  other: ClientRow;
}

/**
 * One business open Mon–Fri 09:00–17:00 (lunch 12:00–13:00), two bookable
 * staff qualified for "Cut" (60 min), one of them for "Colour" (90 min).
 */
export function seed(rules: Partial<BookingRules> = {}): Seed {
  const repo = createMemoryRepository({ now: () => NOW });
  const business: BusinessRow = {
    id: repo.nextId(),
    clerk_org_id: 'org_test',
    name: 'Salon',
    slug: 'salon',
    timezone: 'Africa/Johannesburg',
    currency: 'ZAR',
    logo_url: null,
    address: '1 Main Rd',
    phone: '+27210000000',
    email: 'owner@example.com',
    booking_rules: { ...DEFAULT_BOOKING_RULES, lead_time_minutes: 0, slot_interval_minutes: 30, ...rules },
  };
  repo.tables.businesses.push(business);
  for (const weekday of [1, 2, 3, 4, 5]) {
    repo.tables.business_hours.push(
      { business_id: business.id, weekday, opens_at: '09:00:00', closes_at: '12:00:00' },
      { business_id: business.id, weekday, opens_at: '13:00:00', closes_at: '17:00:00' },
    );
  }
  const service = (name: string, duration_minutes: number, is_active = true): ServiceRow => {
    const row: ServiceRow = {
      id: repo.nextId(),
      business_id: business.id,
      name,
      description: null,
      category: null,
      duration_minutes,
      price_cents: duration_minutes * 1000,
      deposit_cents: 0,
      is_active,
      sort_order: 0,
    };
    repo.tables.services.push(row);
    return row;
  };
  const staff = (name: string, sort_order: number, extra: Partial<StaffRow> = {}): StaffRow => {
    const row: StaffRow = {
      id: repo.nextId(),
      business_id: business.id,
      user_id: null,
      name,
      title: null,
      photo_url: null,
      phone: '+27820000000',
      email: null,
      color: null,
      is_active: true,
      accepts_bookings: true,
      sort_order,
      ...extra,
    };
    repo.tables.staff.push(row);
    return row;
  };
  const client = (phone: string, name: string): ClientRow => {
    const row: ClientRow = {
      id: repo.nextId(),
      business_id: business.id,
      phone_e164: phone,
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
  };

  const cut = service('Cut', 60);
  const colour = service('Colour', 90);
  const inactive = service('Retired', 30, false);
  const thandi = staff('Thandi', 1);
  const sipho = staff('Sipho', 2);
  const off = staff('Off', 0, { accepts_bookings: false });
  const link = (s: StaffRow, svc: ServiceRow) =>
    repo.tables.staff_services.push({ business_id: business.id, staff_id: s.id, service_id: svc.id });
  link(thandi, cut);
  link(sipho, cut);
  link(off, cut);
  link(thandi, colour);
  link(thandi, inactive);

  return {
    repo,
    business,
    cut,
    colour,
    inactive,
    thandi,
    sipho,
    off,
    client: client('+27821234567', 'Nadia'),
    other: client('+27829999999', 'Other'),
  };
}
