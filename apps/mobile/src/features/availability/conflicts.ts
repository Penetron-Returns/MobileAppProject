import type { AppointmentDTO } from '@booking/types';

import { businessDate, formatTime, formatWeekdayDayMonth } from '@/lib/time';

/** Merges per-day conflict lists into one, oldest first, each booking once. */
export function mergeConflicts(
  lists: readonly (readonly AppointmentDTO[])[],
): AppointmentDTO[] {
  const byId = new Map<string, AppointmentDTO>();
  for (const list of lists) for (const a of list) byId.set(a.id, a);
  return [...byId.values()].sort(
    (a, b) =>
      a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id),
  );
}

export interface ConflictNames {
  client: string | null;
  service: string | null;
}

/**
 * "10:00 Thabo, Men's Haircut": the time always, the names once they have
 * loaded, and the date first when the check spans several days.
 */
export function conflictLine(
  a: Pick<AppointmentDTO, 'starts_at'>,
  names: ConflictNames | undefined,
  timezone: string,
  withDate = false,
): string {
  const time = formatTime(a.starts_at, timezone);
  const who = [names?.client, names?.service].filter(Boolean).join(', ');
  const line = who ? `${time} ${who}` : time;
  if (!withDate) return line;
  const day = formatWeekdayDayMonth(businessDate(a.starts_at, timezone));
  return `${day}, ${line}`;
}
