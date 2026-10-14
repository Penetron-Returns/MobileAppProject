/**
 * Time helpers. Instants are ISO strings/Date; calendar dates are `YYYY-MM-DD`
 * in the BUSINESS timezone (never the device's). Weekday: 0 = Sunday.
 */
export type ISODate = string;

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

export const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export const formatters = new Map<string, Intl.DateTimeFormat | null>();

export function formatterFor(tz: string): Intl.DateTimeFormat | null {
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

export const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(y: number, m: number, d: number): ISODate {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseISODate(date: ISODate) {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
}
