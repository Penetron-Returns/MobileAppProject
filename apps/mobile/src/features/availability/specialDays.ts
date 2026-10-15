import type {
  CreateSpecialDayRequest,
  SpecialDayDTO,
  SpecialDayKind,
  SpecialDaySuggestionDTO,
} from '@booking/types';

import type { ConflictQuery } from '@/lib/api';
import { timeToMinutes, toHHmm, type ISODate } from '@/lib/time';

/** Upcoming special days, soonest first (past ones are never shown). */
export function upcomingSpecialDays(
  days: readonly SpecialDayDTO[],
  today: ISODate,
): SpecialDayDTO[] {
  return days
    .filter((d) => d.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The right-hand value of a row: "Closed" or "09:00-13:00". */
export function specialDayValue(day: SpecialDayDTO, closed: string): string {
  if (day.is_closed || !day.start_time || !day.end_time) return closed;
  return `${toHHmm(day.start_time)}-${toHHmm(day.end_time)}`;
}

/** Public holidays still to add: upcoming, not yet a special day, one per date. */
export function pendingSuggestions(
  suggestions: readonly SpecialDaySuggestionDTO[],
  today: ISODate,
): SpecialDaySuggestionDTO[] {
  const seen = new Set<ISODate>();
  return suggestions
    .filter((s) => !s.added && s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((s) => (seen.has(s.date) ? false : (seen.add(s.date), true)));
}

/** A public holiday is added as a closed day. */
export function suggestionRequest(
  s: SpecialDaySuggestionDTO,
): CreateSpecialDayRequest {
  return {
    date: s.date,
    name: s.name,
    kind: 'public_holiday',
    is_closed: true,
  };
}

/** What the add and edit sheet holds while it is open. */
export interface SpecialDayDraft {
  date: ISODate;
  name: string;
  mode: 'closed' | 'hours';
  start: string;
  end: string;
  /** Kept when an existing holiday stays closed. */
  kind: SpecialDayKind | null;
}

export const DEFAULT_SPECIAL_HOURS = { start: '09:00', end: '13:00' };

export function newSpecialDraft(date: ISODate): SpecialDayDraft {
  return {
    date,
    name: '',
    mode: 'closed',
    kind: null,
    ...DEFAULT_SPECIAL_HOURS,
  };
}

export function draftFromSpecialDay(day: SpecialDayDTO): SpecialDayDraft {
  return {
    date: day.date,
    name: day.name,
    mode: day.is_closed ? 'closed' : 'hours',
    kind: day.kind,
    start: day.start_time
      ? toHHmm(day.start_time)
      : DEFAULT_SPECIAL_HOURS.start,
    end: day.end_time ? toHHmm(day.end_time) : DEFAULT_SPECIAL_HOURS.end,
  };
}

export type SpecialDayError = 'name' | 'order';

export function validateSpecialDay(d: SpecialDayDraft): SpecialDayError | null {
  if (!d.name.trim()) return 'name';
  if (d.mode === 'hours' && timeToMinutes(d.end) <= timeToMinutes(d.start)) {
    return 'order';
  }
  return null;
}

export function toSpecialDayRequest(
  d: SpecialDayDraft,
): CreateSpecialDayRequest {
  const name = d.name.trim();
  if (d.mode === 'hours') {
    return {
      date: d.date,
      name,
      kind: 'special_hours',
      is_closed: false,
      start_time: d.start,
      end_time: d.end,
    };
  }
  return {
    date: d.date,
    name,
    kind: d.kind === 'public_holiday' ? 'public_holiday' : 'closure',
    is_closed: true,
    start_time: null,
    end_time: null,
  };
}

/** Which confirmed bookings a closed day or special hours would leave stranded. */
export function specialDayConflictQuery(d: {
  date: ISODate;
  mode: 'closed' | 'hours';
  start: string;
  end: string;
}): ConflictQuery {
  return d.mode === 'closed'
    ? { from: d.date, mode: 'closed' }
    : {
        from: d.date,
        start_time: d.start,
        end_time: d.end,
        mode: 'open_only',
      };
}

/** The closed special days inside [from, to], soonest first, for a "Closed: ..." note. */
export function closedDays(
  days: readonly SpecialDayDTO[],
  from: ISODate,
  to: ISODate,
): SpecialDayDTO[] {
  return days
    .filter((d) => d.is_closed && d.date >= from && d.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * True when saving could strand bookings: a new day, a moved date, or other
 * closed/hours. A rename alone cannot, so it skips the check.
 */
export function changesAvailability(
  day: SpecialDayDTO | null,
  draft: SpecialDayDraft,
): boolean {
  if (!day) return true;
  const before = draftFromSpecialDay(day);
  return (
    before.date !== draft.date ||
    before.mode !== draft.mode ||
    (draft.mode === 'hours' &&
      (before.start !== draft.start || before.end !== draft.end))
  );
}
