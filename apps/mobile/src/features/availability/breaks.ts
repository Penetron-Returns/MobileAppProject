import type { StaffBreakDTO, StaffBreakInput } from '@booking/types';

import { WEEKDAYS_SHORT, timeToMinutes, toHHmm } from '@/lib/time';

import { WEEK_ORDER } from './week';

export const DEFAULT_BREAK = { label: 'Lunch', start: '13:00', end: '13:30' };

/** What the add and edit break sheet holds. `weekdays` empty = every working day. */
export interface BreakDraft {
  label: string;
  start: string;
  end: string;
  weekdays: number[];
}

export function newBreakDraft(): BreakDraft {
  return { ...DEFAULT_BREAK, weekdays: [] };
}

export function draftFromBreak(b: StaffBreakDTO): BreakDraft {
  return {
    label: b.label,
    start: toHHmm(b.start_time),
    end: toHHmm(b.end_time),
    weekdays: [...b.weekdays],
  };
}

/** "Every working day" or "Mon, Wed", Monday first. */
export function weekdaysLabel(
  weekdays: readonly number[],
  everyDay: string,
): string {
  if (weekdays.length === 0 || weekdays.length === 7) return everyDay;
  return WEEK_ORDER.filter((d) => weekdays.includes(d))
    .map((d) => WEEKDAYS_SHORT[d])
    .join(', ');
}

/** "13:00 to 13:30" */
export function breakTimes(
  b: { start_time: string; end_time: string },
  to: string,
): string {
  return `${toHHmm(b.start_time)} ${to} ${toHHmm(b.end_time)}`;
}

/** Earliest first, so the list and the summary read in day order. */
export function sortBreaks(breaks: readonly StaffBreakDTO[]): StaffBreakDTO[] {
  return [...breaks].sort(
    (a, b) =>
      a.start_time.localeCompare(b.start_time) ||
      a.label.localeCompare(b.label),
  );
}

const days = (weekdays: readonly number[]) =>
  weekdays.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : weekdays;

/** Two breaks of one person clash when they share a weekday and overlap in time. */
export function breaksOverlap(a: BreakDraft, b: BreakDraft): boolean {
  const shared = days(a.weekdays).some((d) => days(b.weekdays).includes(d));
  return (
    shared &&
    timeToMinutes(a.start) < timeToMinutes(b.end) &&
    timeToMinutes(b.start) < timeToMinutes(a.end)
  );
}

export type BreakError = 'label' | 'order' | 'overlap';

/** `others` are the person's other breaks (not the one being edited). */
export function validateBreak(
  draft: BreakDraft,
  others: readonly StaffBreakDTO[],
): BreakError | null {
  if (!draft.label.trim()) return 'label';
  if (timeToMinutes(draft.end) <= timeToMinutes(draft.start)) return 'order';
  return others.some((o) => breaksOverlap(draft, draftFromBreak(o)))
    ? 'overlap'
    : null;
}

const toInput = (b: BreakDraft): StaffBreakInput => ({
  label: b.label.trim(),
  start_time: b.start,
  end_time: b.end,
  weekdays: [...b.weekdays].sort((x, y) => x - y),
});

/**
 * The full set to PUT after adding (`id` null) or editing one break: the
 * endpoint replaces every break of the person.
 */
export function breaksWith(
  existing: readonly StaffBreakDTO[],
  id: string | null,
  draft: BreakDraft,
): StaffBreakInput[] {
  const kept = existing.filter((b) => b.id !== id).map(draftFromBreak);
  return [...kept, draft].map(toInput);
}

export function breaksWithout(
  existing: readonly StaffBreakDTO[],
  id: string,
): StaffBreakInput[] {
  return existing
    .filter((b) => b.id !== id)
    .map(draftFromBreak)
    .map(toInput);
}

/**
 * Turns one weekday on or off for a break. Empty means every working day, so
 * the first pick narrows it to that day and picking all seven goes back to empty.
 */
export function toggleWeekday(
  weekdays: readonly number[],
  weekday: number,
): number[] {
  const next = weekdays.includes(weekday)
    ? weekdays.filter((d) => d !== weekday)
    : [...weekdays, weekday];
  return next.length === 7 ? [] : next;
}
