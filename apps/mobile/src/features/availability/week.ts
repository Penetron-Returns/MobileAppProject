import type { AvailabilityRuleInput, BusinessHoursRow } from '@booking/types';

import { timeToMinutes, toHHmm } from '@/lib/time';

/** Display order of the week in settings: Monday first, Sunday last. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** One day of an hours editor: ONE range per day (a lunch gap is a break). */
export interface DayHours {
  weekday: number;
  isOpen: boolean;
  opens: string;
  closes: string;
}

export type TimeEnd = 'opens' | 'closes';

const DEFAULT_RANGE = { opens: '09:00', closes: '17:00' };

interface RangeRow {
  weekday: number;
  from: string;
  to: string;
}

function toWeek(rows: RangeRow[], defaults: RangeRow[]): DayHours[] {
  return WEEK_ORDER.map((weekday) => {
    const own = rows
      .filter((r) => r.weekday === weekday)
      .sort((a, b) => a.from.localeCompare(b.from))[0];
    // A closed day keeps a range to reopen with: the business's, else 09-17.
    const fallback = defaults.find((r) => r.weekday === weekday);
    const range = own ?? fallback;
    return {
      weekday,
      isOpen: own !== undefined,
      opens: range?.from ?? DEFAULT_RANGE.opens,
      closes: range?.to ?? DEFAULT_RANGE.closes,
    };
  });
}

const fromHours = (
  rows: { weekday: number; opens_at: string; closes_at: string }[],
) =>
  rows.map((r) => ({
    weekday: r.weekday,
    from: toHHmm(r.opens_at),
    to: toHHmm(r.closes_at),
  }));

/** The business week (Monday first) from `business_hours` rows. */
export function toWeekSchedule(
  rows: { weekday: number; opens_at: string; closes_at: string }[],
): DayHours[] {
  return toWeek(fromHours(rows), []);
}

/**
 * A person's own week from their availability rules. Days they do not work
 * keep the business's range as the starting point for switching them on.
 */
export function toStaffWeek(
  rules: readonly AvailabilityRuleInput[],
  business: { weekday: number; opens_at: string; closes_at: string }[],
): DayHours[] {
  return toWeek(
    rules.map((r) => ({
      weekday: r.weekday,
      from: toHHmm(r.start_time),
      to: toHHmm(r.end_time),
    })),
    fromHours(business),
  );
}

export function toHoursRows(days: DayHours[]): BusinessHoursRow[] {
  return days
    .filter((d) => d.isOpen)
    .map((d) => ({
      weekday: d.weekday,
      opens_at: d.opens,
      closes_at: d.closes,
    }));
}

export function toRuleRows(days: DayHours[]): AvailabilityRuleInput[] {
  return days
    .filter((d) => d.isOpen)
    .map((d) => ({
      weekday: d.weekday,
      start_time: d.opens,
      end_time: d.closes,
    }));
}

export type HoursError = { weekday: number; reason: 'order' };

/** Every open day must close after it opens. */
export function validateWeek(days: DayHours[]): HoursError | null {
  const bad = days.find(
    (d) => d.isOpen && timeToMinutes(d.closes) <= timeToMinutes(d.opens),
  );
  return bad ? { weekday: bad.weekday, reason: 'order' } : null;
}

/** Why a person's day does not fit the business's, or null when it does. */
export function businessFit(
  day: DayHours,
  business: DayHours | undefined,
): 'closed' | 'outside' | null {
  if (!day.isOpen) return null;
  if (!business?.isOpen) return 'closed';
  const inside =
    timeToMinutes(day.opens) >= timeToMinutes(business.opens) &&
    timeToMinutes(day.closes) <= timeToMinutes(business.closes);
  return inside ? null : 'outside';
}

export type StaffWeekError = {
  weekday: number;
  reason: 'order' | 'closed' | 'outside';
};

/** One range per day, ordered, and inside the business hours of that day. */
export function validateStaffWeek(
  days: DayHours[],
  business: DayHours[],
): StaffWeekError | null {
  const order = validateWeek(days);
  if (order) return order;
  for (const day of days) {
    const fit = businessFit(
      day,
      business.find((b) => b.weekday === day.weekday),
    );
    if (fit) return { weekday: day.weekday, reason: fit };
  }
  return null;
}
