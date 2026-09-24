/**
 * Time helpers. Instants are ISO strings/Date; calendar dates are `YYYY-MM-DD`
 * in the BUSINESS timezone (never the device's). Weekday: 0 = Sunday.
 */
export type ISODate = string;

export const DEFAULT_TZ = 'Africa/Johannesburg';

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

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(tz: string): Intl.DateTimeFormat | null {
  if (formatters.has(tz)) return formatters.get(tz) ?? null;
  let f: Intl.DateTimeFormat | null = null;
  try {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    if (typeof f.formatToParts !== 'function') f = null;
  } catch {
    f = null;
  }
  formatters.set(tz, f);
  return f;
}

export function toDate(instant: Date | string | number): Date {
  if (instant instanceof Date) return instant;
  if (typeof instant === 'number') return new Date(instant);
  return new Date(normaliseTimestamp(instant));
}

/** Postgres emits `2026-09-30 09:00:00+00`; make it ISO-8601 for every JS engine. */
export function normaliseTimestamp(ts: string): string {
  let s = ts.trim().replace(' ', 'T');
  if (!/\d:\d/.test(s)) return s;
  // +00 / -05 → +00:00 / -05:00 ; +0530 → +05:30
  s = s
    .replace(/([+-]\d{2})$/, '$1:00')
    .replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  return s;
}

export function zonedParts(
  instant: Date | string | number,
  tz: string,
): ZonedParts {
  const d = toDate(instant);
  const f = formatterFor(tz);
  if (!f) {
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      hour: d.getHours(),
      minute: d.getMinutes(),
      second: d.getSeconds(),
      weekday: d.getDay(),
    };
  }
  const out: Partial<ZonedParts> = {};
  for (const p of f.formatToParts(d)) {
    switch (p.type) {
      case 'year':
        out.year = Number(p.value);
        break;
      case 'month':
        out.month = Number(p.value);
        break;
      case 'day':
        out.day = Number(p.value);
        break;
      case 'hour':
        out.hour = Number(p.value) % 24;
        break;
      case 'minute':
        out.minute = Number(p.value);
        break;
      case 'second':
        out.second = Number(p.value);
        break;
      case 'weekday':
        out.weekday = WEEKDAY_INDEX[p.value.slice(0, 3)] ?? 0;
        break;
    }
  }
  return out as ZonedParts;
}

/** Minutes to add to UTC to get wall-clock time in `tz` at `instant`. */
export function tzOffsetMinutes(instant: Date, tz: string): number {
  const p = zonedParts(instant, tz);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  const floored = Math.floor(instant.getTime() / 1000) * 1000;
  return Math.round((asUtc - floored) / 60000);
}

/** Wall-clock `date` + `HH:mm` in `tz` → the UTC instant. */
export function zonedTimeToUtc(date: ISODate, time: string, tz: string): Date {
  const { y, m, d } = parseISODate(date);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  const off1 = tzOffsetMinutes(new Date(guess), tz);
  let result = guess - off1 * 60000;
  const off2 = tzOffsetMinutes(new Date(result), tz);
  if (off2 !== off1) result = guess - off2 * 60000;
  return new Date(result);
}

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(y: number, m: number, d: number): ISODate {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseISODate(date: ISODate) {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
}

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

export function startOfMonth(date: ISODate): ISODate {
  const { y, m } = parseISODate(date);
  return toISODate(y, m, 1);
}

export function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function endOfMonth(date: ISODate): ISODate {
  const { y, m } = parseISODate(date);
  return toISODate(y, m, daysInMonth(y, m));
}

export function addMonths(date: ISODate, n: number): ISODate {
  const { y, m, d } = parseISODate(date);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return toISODate(ny, nm, Math.min(d, daysInMonth(ny, nm)));
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

/** `dd/mm/yyyy` as in the Add Booking mockup. */
export function formatDateDMY(date: ISODate) {
  const { y, m, d } = parseISODate(date);
  return `${pad(d)}/${pad(m)}/${y}`;
}

/** `25–31 Aug` or `29 Sep – 5 Oct` */
export function formatWeekRange(start: ISODate) {
  const end = addDays(start, 6);
  const a = parseISODate(start);
  const b = parseISODate(end);
  if (a.m === b.m) return `${a.d}–${b.d} ${MONTHS_SHORT[b.m - 1]}`;
  return `${a.d} ${MONTHS_SHORT[a.m - 1]} – ${b.d} ${MONTHS_SHORT[b.m - 1]}`;
}

export function formatMonthYear(date: ISODate) {
  const { y, m } = parseISODate(date);
  return `${MONTHS[m - 1]} ${y}`;
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
