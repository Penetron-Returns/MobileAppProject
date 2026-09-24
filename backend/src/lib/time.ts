/**
 * Time helpers shared by the booking core.
 *
 * - Postgres `tstzrange` parsing/serialisation (PostgREST returns ranges as text,
 *   e.g. `["2026-09-30 09:00:00+00","2026-09-30 10:00:00+00")`).
 * - Postgres `timestamptz` text → ISO instant.
 * - Wall-clock helpers (`HH:mm` ↔ minutes, `YYYY-MM-DD` arithmetic, weekday,
 *   wall-clock → instant in an IANA zone) built on luxon so DST is handled.
 *
 * Everything here is pure and deterministic.
 */
import { DateTime, IANAZone } from 'luxon';

// ---------- instants ----------

const PG_TS_RE =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?\s*(Z|z|[+-]\d{2}(?::?\d{2}(?::?\d{2})?)?)?$/;

/**
 * Parses a Postgres/ISO timestamp with offset into epoch milliseconds.
 * Accepts `2026-09-30 09:00:00+00`, `2026-09-30T09:00:00.123456+02:00`,
 * `2026-09-30T09:00:00Z`, and historical second-precision offsets (`+00:19:32`).
 * A missing offset is treated as UTC (Postgres always prints one for timestamptz).
 */
export function parsePgTimestamp(value: string): number {
  const m = PG_TS_RE.exec(value.trim());
  if (!m) throw new Error(`Invalid timestamp: ${value}`);
  const [, y, mo, d, h, mi, s = '0', frac = '', off = 'Z'] = m;
  const ms = Number(frac.padEnd(3, '0').slice(0, 3));
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), ms);
  return utc - offsetSeconds(off) * 1000;
}

function offsetSeconds(off: string): number {
  if (off === 'Z' || off === 'z') return 0;
  const sign = off.startsWith('-') ? -1 : 1;
  const digits = off.slice(1).replace(/:/g, '');
  const hh = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4) || '0');
  const ss = Number(digits.slice(4, 6) || '0');
  return sign * (hh * 3600 + mm * 60 + ss);
}

/** Normalises any Postgres/ISO timestamp string to `YYYY-MM-DDTHH:mm:ss.sssZ`. */
export function toIsoInstant(value: string): string {
  return new Date(parsePgTimestamp(value)).toISOString();
}

// ---------- tstzrange ----------

export interface TsRange {
  /** ISO instant, or null for an unbounded side */
  lower: string | null;
  upper: string | null;
  lowerInclusive: boolean;
  upperInclusive: boolean;
}

/**
 * Parses a Postgres range literal. Returns null for `empty`.
 * Handles quoted and unquoted bounds, any bracket combination and infinite bounds.
 */
export function parseTsRange(literal: string): TsRange | null {
  const text = literal.trim();
  if (text.toLowerCase() === 'empty') return null;
  const open = text[0];
  const close = text[text.length - 1];
  if ((open !== '[' && open !== '(') || (close !== ']' && close !== ')')) {
    throw new Error(`Invalid range literal: ${literal}`);
  }
  const [rawLower, rawUpper] = splitRangeBody(text.slice(1, -1), literal);
  return {
    lower: parseBound(rawLower),
    upper: parseBound(rawUpper),
    lowerInclusive: open === '[' && rawLower !== '',
    upperInclusive: close === ']' && rawUpper !== '',
  };
}

function splitRangeBody(body: string, literal: string): [string, string] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]!;
    if (ch === '"') {
      if (quoted && body[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === '\\' && i + 1 < body.length) {
      current += body[i + 1];
      i += 1;
    } else if (ch === ',' && !quoted) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  if (parts.length !== 2 || quoted) throw new Error(`Invalid range literal: ${literal}`);
  return [parts[0]!.trim(), parts[1]!.trim()];
}

function parseBound(raw: string): string | null {
  if (raw === '' || raw.toLowerCase() === 'infinity' || raw.toLowerCase() === '-infinity') return null;
  return toIsoInstant(raw);
}

/** Half-open `[start,end)` literal suitable for PostgREST filters and RPC args. */
export function serializeTsRange(startIso: string, endIso: string): string {
  return `[${toIsoInstant(startIso)},${toIsoInstant(endIso)})`;
}

/** Start/end of a half-open range as ISO instants. Throws on unbounded/empty ranges. */
export function rangeBounds(literal: string): { start: string; end: string } {
  const range = parseTsRange(literal);
  if (!range || range.lower === null || range.upper === null) {
    throw new Error(`Expected a bounded range: ${literal}`);
  }
  return { start: range.lower, end: range.upper };
}

// ---------- wall clock ----------

const TIME_RE = /^([01]\d|2[0-4]):([0-5]\d)(?::([0-5]\d)(?:\.\d+)?)?$/;

/** `HH:mm` or `HH:mm:ss` (Postgres `time`) → minutes after midnight. `24:00` → 1440. */
export function parseTimeOfDay(value: string): number {
  const m = TIME_RE.exec(value.trim());
  if (!m) throw new Error(`Invalid time of day: ${value}`);
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  if (minutes > 1440 || (minutes === 1440 && Number(m[3] ?? 0) > 0)) {
    throw new Error(`Invalid time of day: ${value}`);
  }
  return minutes;
}

export function isTimeOfDay(value: string): boolean {
  try {
    parseTimeOfDay(value);
    return true;
  } catch {
    return false;
  }
}

/** Minutes after midnight → `HH:mm`. */
export function formatTimeOfDay(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Postgres `time` text (`09:00:00`) → API `HH:mm`. */
export function normaliseTimeOfDay(value: string): string {
  return formatTimeOfDay(parseTimeOfDay(value));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date in `YYYY-MM-DD`. */
export function isIsoDate(value: string): boolean {
  return DATE_RE.test(value) && DateTime.fromISO(value, { zone: 'UTC' }).isValid;
}

function dateUtc(date: string): DateTime {
  const dt = DateTime.fromISO(date, { zone: 'UTC' });
  if (!DATE_RE.test(date) || !dt.isValid) throw new Error(`Invalid date: ${date}`);
  return dt;
}

export function addDays(date: string, days: number): string {
  return dateUtc(date).plus({ days }).toISODate()!;
}

/** Whole days from `a` to `b` (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round(dateUtc(b).diff(dateUtc(a), 'days').days);
}

/** Inclusive list of dates from `from` to `to`. Empty when `to < from`. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 0 = Sunday … 6 = Saturday (JS getDay / Postgres dow). */
export function weekdayOf(date: string): number {
  return dateUtc(date).weekday % 7;
}

export function isValidTimeZone(zone: string): boolean {
  return IANAZone.isValidZone(zone);
}

/** Calendar date of an instant in a zone. */
export function dateInZone(instant: Date | string, zone: string): string {
  const ms = typeof instant === 'string' ? parsePgTimestamp(instant) : instant.getTime();
  return DateTime.fromMillis(ms, { zone }).toISODate()!;
}

/**
 * Wall-clock `date` + `minutes` after midnight in `zone` → epoch ms.
 * DST: a wall time inside a spring-forward gap resolves to the instant after
 * the gap (01:30 → 02:30 BST); an ambiguous fall-back time resolves to its
 * first occurrence (luxon's behaviour). 1440 means midnight of the next day.
 */
export function wallClockToEpoch(date: string, minutes: number, zone: string): number {
  const day = minutes >= 1440 ? addDays(date, Math.floor(minutes / 1440)) : date;
  const rem = minutes % 1440;
  const [y, mo, d] = day.split('-').map(Number) as [number, number, number];
  const dt = DateTime.fromObject(
    { year: y, month: mo, day: d, hour: Math.floor(rem / 60), minute: rem % 60 },
    { zone },
  );
  if (!dt.isValid) throw new Error(`Invalid wall-clock time ${day} ${rem} in ${zone}`);
  return dt.toMillis();
}

/** Start and end (exclusive) of a calendar day in `zone` as epoch ms. */
export function dayBoundsInZone(date: string, zone: string): { start: number; end: number } {
  return { start: wallClockToEpoch(date, 0, zone), end: wallClockToEpoch(date, 1440, zone) };
}
