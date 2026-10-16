import { businessDate, weekdayOf, zonedParts, type ISODate } from '@/lib/time';

import { bucketKey, type ReportPeriod } from './period';
import {
  reportSource,
  sourceRows,
  type ReportSourceKey,
  type SourceRow,
} from './sources';

export type ReportStatus = 'confirmed' | 'cancelled' | 'completed' | 'no_show';

/** The columns of an appointment the report needs, already flattened. */
export interface ReportRow {
  starts_at: string;
  status: ReportStatus;
  source: string;
  price_cents: number;
  client_id: string;
  staff_id: string;
  staff_name: string | null;
  staff_color: string | null;
}

export interface RevenueBar {
  key: ISODate;
  cents: number;
}

export interface StaffRow {
  staffId: string;
  name: string;
  color: string | null;
  revenueCents: number;
  bookings: number;
}

export interface HeatMap {
  /** Weekday numbers shown as rows, Monday first (0 = Sunday). */
  weekdays: number[];
  hours: number[];
  /** `levels[row][col]`: 0 = none, 1 to 5 = share of the busiest cell. */
  levels: number[][];
  /** The single busiest weekday and hour. */
  peak: { weekday: number; hour: number };
}

export interface ReportData {
  revenueCents: number;
  /** Whole percent change against the previous period, or null with nothing to compare. */
  deltaPercent: number | null;
  bars: RevenueBar[];
  bookings: number;
  /** No-shows over completed plus no-shows, or null while none has been resolved. */
  noShowPercent: number | null;
  /** Share of booked clients first seen before this period, or null with no clients. */
  returningPercent: number | null;
  staff: StaffRow[];
  sources: SourceRow[];
  heat: HeatMap | null;
}

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];
const MIN_FIRST_HOUR = 8;
const MIN_LAST_HOUR = 17;

const isBooked = (row: ReportRow) => row.status !== 'cancelled';

const percent = (part: number, whole: number) =>
  whole === 0 ? null : Math.round((part / whole) * 100);

function revenueOf(rows: readonly ReportRow[]) {
  return rows
    .filter((r) => r.status === 'completed')
    .reduce((sum, r) => sum + r.price_cents, 0);
}

function staffRows(rows: readonly ReportRow[]): StaffRow[] {
  const byStaff = new Map<string, StaffRow>();
  for (const r of rows.filter(isBooked)) {
    const row = byStaff.get(r.staff_id) ?? {
      staffId: r.staff_id,
      name: r.staff_name ?? '',
      color: r.staff_color,
      revenueCents: 0,
      bookings: 0,
    };
    row.bookings += 1;
    if (r.status === 'completed') row.revenueCents += r.price_cents;
    byStaff.set(r.staff_id, row);
  }
  return [...byStaff.values()].sort(
    (a, b) =>
      b.revenueCents - a.revenueCents ||
      b.bookings - a.bookings ||
      a.name.localeCompare(b.name),
  );
}

function heatMap(rows: readonly ReportRow[], timezone: string): HeatMap | null {
  const booked = rows.filter(isBooked);
  if (booked.length === 0) return null;
  const counts = new Map<string, number>();
  let firstHour = MIN_FIRST_HOUR;
  let lastHour = MIN_LAST_HOUR;
  for (const r of booked) {
    const { hour } = zonedParts(r.starts_at, timezone);
    const weekday = weekdayOf(businessDate(r.starts_at, timezone));
    const cell = `${weekday}:${hour}`;
    counts.set(cell, (counts.get(cell) ?? 0) + 1);
    firstHour = Math.min(firstHour, hour);
    lastHour = Math.max(lastHour, hour);
  }
  const hours = Array.from(
    { length: lastHour - firstHour + 1 },
    (_, i) => firstHour + i,
  );
  const hasSunday = hours.some((h) => counts.has(`0:${h}`));
  // Sunday only earns a row when someone is booked on one.
  const weekdays = MONDAY_FIRST.filter((d) => d !== 0 || hasSunday);
  const [peakCell, peak] = [...counts.entries()].reduce((best, entry) =>
    entry[1] > best[1] ? entry : best,
  );
  const [peakDay, peakHour] = peakCell.split(':').map(Number);
  const levels = weekdays.map((d) =>
    hours.map((h) => {
      const n = counts.get(`${d}:${h}`) ?? 0;
      return n === 0 ? 0 : Math.max(1, Math.ceil((n / peak) * 5));
    }),
  );
  return {
    weekdays,
    hours,
    levels,
    peak: { weekday: peakDay, hour: peakHour },
  };
}

/**
 * Pure: everything the Reports screen shows, from the appointments of the
 * period and the one before it. Days are business-timezone days; money stays
 * in integer cents. `newClientIds` are clients created within the period.
 */
export function buildReport(input: {
  rows: readonly ReportRow[];
  newClientIds: ReadonlySet<string>;
  period: ReportPeriod;
  timezone: string;
}): ReportData {
  const { rows, newClientIds, period, timezone } = input;
  const dayOf = (r: ReportRow) => businessDate(r.starts_at, timezone);
  const within = (r: ReportRow, from: ISODate, to: ISODate) =>
    dayOf(r) >= from && dayOf(r) < to;
  const current = rows.filter((r) => within(r, period.from, period.to));
  const previous = rows.filter((r) =>
    within(r, period.prevFrom, period.prevTo),
  );

  const revenueCents = revenueOf(current);
  const previousRevenue = revenueOf(previous);
  const perBucket = new Map<ISODate, number>();
  for (const r of current.filter((x) => x.status === 'completed')) {
    const key = bucketKey(dayOf(r), period.granularity);
    perBucket.set(key, (perBucket.get(key) ?? 0) + r.price_cents);
  }

  const booked = current.filter(isBooked);
  const resolved = current.filter(
    (r) => r.status === 'completed' || r.status === 'no_show',
  );
  const clients = new Set(booked.map((r) => r.client_id));
  const returning = [...clients].filter((id) => !newClientIds.has(id)).length;
  const sourceCounts: Record<ReportSourceKey, number> = {
    whatsapp: 0,
    clovie: 0,
  };
  for (const r of booked) sourceCounts[reportSource(r.source)] += 1;

  return {
    revenueCents,
    deltaPercent:
      previousRevenue === 0
        ? null
        : Math.round(
            ((revenueCents - previousRevenue) / previousRevenue) * 100,
          ),
    bars: period.buckets.map((key) => ({
      key,
      cents: perBucket.get(key) ?? 0,
    })),
    bookings: booked.length,
    noShowPercent: percent(
      resolved.filter((r) => r.status === 'no_show').length,
      resolved.length,
    ),
    returningPercent: percent(returning, clients.size),
    staff: staffRows(current),
    sources: sourceRows(sourceCounts),
    heat: heatMap(current, timezone),
  };
}
