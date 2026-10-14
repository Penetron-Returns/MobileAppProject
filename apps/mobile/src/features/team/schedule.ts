import { WEEKDAYS, WEEKDAYS_SHORT, toHHmm } from '@/lib/time';

export interface AvailabilityRule {
  weekday: number;
  start_time: string;
  end_time: string;
}

export interface WorkingDay {
  weekday: number;
  /** "08:00" to "17:00" pairs, earliest first; empty when the person is off. */
  ranges: { from: string; to: string }[];
}

/** Display order of the week: Monday first, Sunday last. */
const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;

/** One entry per weekday, Monday first, from a person's weekly availability rules. */
export function toWorkingWeek(
  rules: readonly AvailabilityRule[],
): WorkingDay[] {
  return WEEK.map((weekday) => ({
    weekday,
    ranges: rules
      .filter((r) => r.weekday === weekday)
      .map((r) => ({ from: toHHmm(r.start_time), to: toHHmm(r.end_time) }))
      .sort((a, b) => a.from.localeCompare(b.from)),
  }));
}

/** The hours text of a day ("08:00 to 17:00", split shifts joined), or null when off. */
export function dayHours(day: WorkingDay, to: string): string | null {
  if (!day.ranges.length) return null;
  return day.ranges.map((r) => `${r.from} ${to} ${r.to}`).join(', ');
}

/**
 * "Mon to Sat, 08:00 to 17:00": the worked days as a range when they run
 * unbroken, otherwise listed, then the first worked day's hours. Null when
 * the person has no working days.
 */
export function workingDaysSummary(
  week: readonly WorkingDay[],
  to: string,
): string | null {
  const worked = week.filter((d) => d.ranges.length);
  if (!worked.length) return null;
  const indexes = worked.map((d) =>
    WEEK.indexOf(d.weekday as (typeof WEEK)[number]),
  );
  const unbroken =
    indexes[indexes.length - 1] - indexes[0] + 1 === worked.length;
  const days =
    unbroken && worked.length > 2
      ? `${WEEKDAYS_SHORT[worked[0].weekday]} ${to} ${WEEKDAYS_SHORT[worked[worked.length - 1].weekday]}`
      : worked.map((d) => WEEKDAYS_SHORT[d.weekday]).join(', ');
  return `${days}, ${dayHours(worked[0], to)}`;
}

/** Full weekday name, for the per-day lines. */
export const weekdayName = (weekday: number) => WEEKDAYS[weekday];
