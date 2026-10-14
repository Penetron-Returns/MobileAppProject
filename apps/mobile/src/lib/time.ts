import {
  ISODate,
  zonedParts,
  zonedTimeToUtc,
  pad,
  toISODate,
  parseISODate,
} from './zoned';

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
export const WEEKDAYS_SHORT = WEEKDAYS.map((d) => d.slice(0, 3));

export function businessDate(
  instant: Date | string | number,
  tz: string,
): ISODate {
  const p = zonedParts(instant, tz);
  return toISODate(p.year, p.month, p.day);
}

export function todayISO(tz: string, now: Date = new Date()): ISODate {
  return businessDate(now, tz);
}

export function minutesSinceMidnight(
  instant: Date | string | number,
  tz: string,
) {
  const p = zonedParts(instant, tz);
  return p.hour * 60 + p.minute;
}

/** [start of `date`, start of the next day) as UTC instants. */
export function dayRangeUtc(date: ISODate, tz: string) {
  return {
    from: zonedTimeToUtc(date, '00:00', tz),
    to: zonedTimeToUtc(addDays(date, 1), '00:00', tz),
  };
}

// ---------- pure calendar-date arithmetic (UTC based, DST-safe) ----------
function isoToUtcMs(date: ISODate) {
  const { y, m, d } = parseISODate(date);
  return Date.UTC(y, m - 1, d);
}
function utcMsToISO(ms: number): ISODate {
  const dt = new Date(ms);
  return toISODate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(date: ISODate, n: number): ISODate {
  return utcMsToISO(isoToUtcMs(date) + n * 86_400_000);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((isoToUtcMs(a) - isoToUtcMs(b)) / 86_400_000);
}

export function weekdayOf(date: ISODate): number {
  return new Date(isoToUtcMs(date)).getUTCDay();
}

/** Monday-first by default (as in the mockups' month grid). */
export function startOfWeek(date: ISODate, weekStartsOn = 1): ISODate {
  const wd = weekdayOf(date);
  const delta = (wd - weekStartsOn + 7) % 7;
  return addDays(date, -delta);
}

export function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// ---------- formatting ----------
export function formatHM(hour: number, minute: number, h12 = true) {
  if (!h12) return `${pad(hour)}:${pad(minute)}`;
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${pad(minute)} ${suffix}`;
}

/** Instant → wall-clock time in tz: `10:30 AM` (h12) or `14:30`. */
export function formatTime(
  instant: Date | string | number,
  tz: string,
  h12 = false,
) {
  const p = zonedParts(instant, tz);
  return formatHM(p.hour, p.minute, h12);
}

/** `HH:mm[:ss]` → `09:00 AM` / `09:00`. */
export function formatTimeOfDay(time: string, h12 = true) {
  const [h, m] = time.split(':').map(Number);
  if (!h12) return `${pad(h)}:${pad(m)}`;
  const suffix = h < 12 ? 'AM' : 'PM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${pad(hh)}:${pad(m)} ${suffix}`;
}

/** Trim Postgres `time` values (`09:00:00`) to `HH:mm`. */
export function toHHmm(time: string) {
  return time.slice(0, 5);
}

export function timeToMinutes(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(min: number) {
  const clamped = Math.max(0, Math.min(24 * 60, min));
  return `${pad(Math.floor(clamped / 60) % 24)}:${pad(clamped % 60)}`;
}

/** `Tue, Aug 25` */
export function formatDateShort(date: ISODate) {
  const { m, d } = parseISODate(date);
  return `${WEEKDAYS_SHORT[weekdayOf(date)]}, ${MONTHS_SHORT[m - 1]} ${d}`;
}

/** `October 24, 2023` */
export function formatDateLong(date: ISODate) {
  const { y, m, d } = parseISODate(date);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** `Aug 18, 2023` */
export function formatDateMedium(date: ISODate) {
  const { y, m, d } = parseISODate(date);
  return `${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}

/** `25–31 Aug` or `29 Sep – 5 Oct` */
export function formatWeekRange(start: ISODate) {
  const end = addDays(start, 6);
  const a = parseISODate(start);
  const b = parseISODate(end);
  if (a.m === b.m) return `${a.d}–${b.d} ${MONTHS_SHORT[b.m - 1]}`;
  return `${a.d} ${MONTHS_SHORT[a.m - 1]} – ${b.d} ${MONTHS_SHORT[b.m - 1]}`;
}

/** "Today", "Yesterday", "3 days ago", else `Oct 15, 2023`. */
export function formatRelativeDate(date: ISODate, today: ISODate) {
  const diff = diffDays(today, date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return `${diff} days ago`;
  if (diff === -1) return 'Tomorrow';
  return formatDateMedium(date);
}
export * from './zoned';
