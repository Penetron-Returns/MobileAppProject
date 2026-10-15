/**
 * Which existing appointments would a proposed special day or time off overlap? Pure.
 * The app shows these before saving; nothing is ever cancelled automatically.
 */
import type { ISODate, UUID } from '@booking/types';
import { dateRange, parseTimeOfDay, wallClockToEpoch } from '../../lib/time.ts';

const DAY_MINUTES = 24 * 60;

/** `closed`: the window becomes unavailable. `open_only`: only the window stays available. */
export type ConflictMode = 'closed' | 'open_only';

export interface ProposedUnavailability {
  /** Inclusive dates in the business timezone */
  from: ISODate;
  to: ISODate;
  /** Both null = the whole day; both set = those hours on each date */
  startTime: string | null;
  endTime: string | null;
  mode: ConflictMode;
}

export interface AppointmentSpan {
  staff_id: UUID;
  /** ISO instants */
  starts_at: string;
  ends_at: string;
}

/** Wall-clock minutes of one date that the proposal removes from bookable time. */
function blockedMinutes(p: ProposedUnavailability): [number, number][] {
  const hasTimes = p.startTime !== null && p.endTime !== null;
  if (!hasTimes) return p.mode === 'closed' ? [[0, DAY_MINUTES]] : [];
  const start = parseTimeOfDay(p.startTime!);
  const end = parseTimeOfDay(p.endTime!);
  if (p.mode === 'closed') return [[start, end]];
  return [
    [0, start],
    [end, DAY_MINUTES],
  ];
}

/** Appointments (optionally of one staff member) that overlap the proposal, in input order. */
export function findConflicts<T extends AppointmentSpan>(
  appointments: T[],
  proposal: ProposedUnavailability,
  timezone: string,
  staffId?: UUID | null,
): T[] {
  const minutes = blockedMinutes(proposal).filter(([s, e]) => e > s);
  if (minutes.length === 0 || proposal.to < proposal.from) return [];
  const blocked = dateRange(proposal.from, proposal.to).flatMap((date) =>
    minutes.map(([s, e]): [number, number] => [wallClockToEpoch(date, s, timezone), wallClockToEpoch(date, e, timezone)]),
  );
  return appointments.filter((a) => {
    if (staffId && a.staff_id !== staffId) return false;
    const start = Date.parse(a.starts_at);
    const end = Date.parse(a.ends_at);
    return blocked.some(([bs, be]) => start < be && bs < end);
  });
}
