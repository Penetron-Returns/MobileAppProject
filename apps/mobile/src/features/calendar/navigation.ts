export type CalendarViewMode = 'day' | 'week' | 'month';

type CalendarListener = (mode: CalendarViewMode) => void;
const listeners = new Set<CalendarListener>();

/** Lets other tabs switch the mounted calendar's view (e.g. dashboard "View all"). */
export function setCalendarViewMode(mode: CalendarViewMode) {
  listeners.forEach((fn) => fn(mode));
}

export function subscribeCalendarViewMode(fn: CalendarListener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
