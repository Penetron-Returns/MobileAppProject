import type {
  CreateStaffTimeOffRequest,
  StaffTimeOffDTO,
  TimeOffReason,
} from '@booking/types';

import type { ConflictQuery } from '@/lib/api';
import {
  formatDayRange,
  formatWeekdayDayMonth,
  timeToMinutes,
  toHHmm,
  type ISODate,
} from '@/lib/time';

export const TIME_OFF_REASONS: readonly TimeOffReason[] = [
  'leave',
  'sick',
  'training',
  'other',
];

/** What the add and edit time off sheet holds. */
export interface TimeOffDraft {
  reason: TimeOffReason;
  startsOn: ISODate;
  endsOn: ISODate;
  allDay: boolean;
  start: string;
  end: string;
  note: string;
}

export function newTimeOffDraft(date: ISODate): TimeOffDraft {
  return {
    reason: 'leave',
    startsOn: date,
    endsOn: date,
    allDay: true,
    start: '09:00',
    end: '13:00',
    note: '',
  };
}

export function draftFromTimeOff(t: StaffTimeOffDTO): TimeOffDraft {
  const timed = t.start_time !== null && t.end_time !== null;
  return {
    reason: t.reason,
    startsOn: t.starts_on,
    endsOn: t.ends_on,
    allDay: !timed,
    start: t.start_time ? toHHmm(t.start_time) : '09:00',
    end: t.end_time ? toHHmm(t.end_time) : '13:00',
    note: t.note ?? '',
  };
}

export type TimeOffError = 'range' | 'order';

export function validateTimeOff(d: TimeOffDraft): TimeOffError | null {
  if (d.endsOn < d.startsOn) return 'range';
  if (!d.allDay && timeToMinutes(d.end) <= timeToMinutes(d.start)) {
    return 'order';
  }
  return null;
}

/** Times are always sent (null = all day) so an edit can switch either way. */
export function toTimeOffRequest(d: TimeOffDraft): CreateStaffTimeOffRequest {
  return {
    starts_on: d.startsOn,
    ends_on: d.endsOn,
    start_time: d.allDay ? null : d.start,
    end_time: d.allDay ? null : d.end,
    reason: d.reason,
    note: d.note.trim() || null,
  };
}

/** Which confirmed bookings of this person the absence would leave stranded. */
export function timeOffConflictQuery(
  staffId: string,
  d: TimeOffDraft,
): ConflictQuery {
  return {
    from: d.startsOn,
    to: d.endsOn,
    staff_id: staffId,
    mode: 'closed',
    ...(d.allDay ? {} : { start_time: d.start, end_time: d.end }),
  };
}

/** Entries that have not ended yet, soonest first. */
export function upcomingTimeOff(
  entries: readonly StaffTimeOffDTO[],
  today: ISODate,
): StaffTimeOffDTO[] {
  return entries
    .filter((e) => e.ends_on >= today)
    .sort(
      (a, b) =>
        a.starts_on.localeCompare(b.starts_on) || a.id.localeCompare(b.id),
    );
}

/**
 * "24 to 26 Dec" for whole days; with hours, "Thu 14 Dec, 14:00 to 17:00"
 * (or the day range when it spans several days).
 */
export function timeOffRange(e: StaffTimeOffDTO, to: string): string {
  const range = formatDayRange(e.starts_on, e.ends_on, to);
  if (!e.start_time || !e.end_time) return range;
  const days =
    e.starts_on === e.ends_on ? formatWeekdayDayMonth(e.starts_on) : range;
  return `${days}, ${toHHmm(e.start_time)} ${to} ${toHHmm(e.end_time)}`;
}
