/** Shape rules for weekly hour rows: one range per weekday (a lunch gap is a staff break, not a second range). */

/** The first weekday that appears more than once, else null. Identical duplicates are still duplicates here. */
export function findRepeatedWeekday(rows: { weekday: number }[]): number | null {
  const seen = new Set<number>();
  for (const { weekday } of rows) {
    if (seen.has(weekday)) return weekday;
    seen.add(weekday);
  }
  return null;
}
