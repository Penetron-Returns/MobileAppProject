import { WEEKDAYS_SHORT } from '@/lib/time';

const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;

/**
 * The days a business opens, for the Settings row: "Mon–Sat" for an unbroken
 * run of three or more, otherwise the days listed ("Mon, Wed"). Null when it
 * has no opening hours at all (the caller says "Closed").
 */
export function openDaysSummary(
  rows: readonly { weekday: number }[],
): string | null {
  const open = WEEK.filter((d) => rows.some((r) => r.weekday === d));
  if (open.length === 0) return null;
  const first = WEEK.indexOf(open[0]);
  const last = WEEK.indexOf(open[open.length - 1]);
  if (open.length > 2 && last - first + 1 === open.length) {
    return `${WEEKDAYS_SHORT[open[0]]}–${WEEKDAYS_SHORT[open[open.length - 1]]}`;
  }
  return open.map((d) => WEEKDAYS_SHORT[d]).join(', ');
}
