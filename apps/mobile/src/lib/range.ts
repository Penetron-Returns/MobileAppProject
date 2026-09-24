import { normaliseTimestamp } from './time';

export interface InstantRange {
  start: string; // ISO-8601
  end: string; // ISO-8601
}

/**
 * Parses a Postgres `tstzrange` as returned by PostgREST, e.g.
 * `["2026-09-30 09:00:00+00","2026-09-30 10:00:00+00")`.
 * Also accepts an already-split `{ starts_at, ends_at }` shape so the app
 * keeps working if the API/views expose explicit columns instead.
 */
export function parseTstzRange(value: unknown): InstantRange | null {
  if (!value) return null;
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    const s = v.starts_at ?? v.start ?? v.lower;
    const e = v.ends_at ?? v.end ?? v.upper;
    if (typeof s === 'string' && typeof e === 'string') {
      return { start: toIso(s), end: toIso(e) };
    }
    return null;
  }
  if (typeof value !== 'string') return null;
  const m = /^[[(]\s*"?([^",]*)"?\s*,\s*"?([^",]*)"?\s*[\])]$/.exec(
    value.trim(),
  );
  if (!m || !m[1] || !m[2]) return null;
  return { start: toIso(m[1]), end: toIso(m[2]) };
}

function toIso(ts: string) {
  const d = new Date(normaliseTimestamp(ts));
  return Number.isNaN(d.getTime()) ? ts : d.toISOString();
}

/** PostgREST literal for a half-open range, for `.filter('slot', 'ov', …)`. */
export function rangeLiteral(from: Date | string, to: Date | string) {
  const a = typeof from === 'string' ? from : from.toISOString();
  const b = typeof to === 'string' ? to : to.toISOString();
  return `[${a},${b})`;
}
