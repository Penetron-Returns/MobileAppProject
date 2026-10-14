import { timeToMinutes, weekdayOf, type ISODate } from '@/lib/time';

export const DEFAULT_DAY = { startMin: 9 * 60, endMin: 18 * 60 };

export interface MinuteSpan {
  startMin: number;
  endMin: number;
}

export interface HoursRow {
  weekday: number;
  opens_at: string;
  closes_at: string;
}

export interface RuleRow {
  staff_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
}

export interface OverrideRow {
  staff_id: string | null;
  date: string;
  is_closed: boolean;
  start_time: string | null;
  end_time: string | null;
}

// ---------- working hours ----------

/** Sorts spans and merges overlapping or touching ones. */
export function mergeSpans(spans: MinuteSpan[]): MinuteSpan[] {
  const sorted = spans
    .filter((s) => s.endMin > s.startMin)
    .map((s) => ({ ...s }))
    .sort((a, b) => a.startMin - b.startMin);
  const merged: MinuteSpan[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last && span.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, span.endMin);
    } else {
      merged.push(span);
    }
  }
  return merged;
}

export function intersectSpans(a: MinuteSpan[], b: MinuteSpan[]): MinuteSpan[] {
  const out: MinuteSpan[] = [];
  for (const x of mergeSpans(a)) {
    for (const y of mergeSpans(b)) {
      const startMin = Math.max(x.startMin, y.startMin);
      const endMin = Math.min(x.endMin, y.endMin);
      if (endMin > startMin) out.push({ startMin, endMin });
    }
  }
  return mergeSpans(out);
}

/** The parts of `window` that no span covers: the hatched off-hours. */
export function complementSpans(
  spans: MinuteSpan[],
  window: MinuteSpan,
): MinuteSpan[] {
  const out: MinuteSpan[] = [];
  let cursor = window.startMin;
  for (const span of mergeSpans(spans)) {
    if (span.endMin <= window.startMin || span.startMin >= window.endMin) {
      continue;
    }
    if (span.startMin > cursor) {
      out.push({ startMin: cursor, endMin: span.startMin });
    }
    cursor = Math.max(cursor, span.endMin);
  }
  if (cursor < window.endMin) {
    out.push({ startMin: cursor, endMin: window.endMin });
  }
  return out;
}

export function overrideSpans(overrides: OverrideRow[]): MinuteSpan[] | null {
  if (overrides.length === 0) return null;
  if (overrides.some((o) => o.is_closed)) return [];
  return mergeSpans(
    overrides
      .filter((o) => o.start_time && o.end_time)
      .map((o) => ({
        startMin: timeToMinutes(o.start_time as string),
        endMin: timeToMinutes(o.end_time as string),
      })),
  );
}

/** Business windows for a date: a business-wide override decides, else the weekly hours. */
export function businessWindows(
  date: ISODate,
  hours: HoursRow[],
  overrides: OverrideRow[],
): MinuteSpan[] {
  const override = overrideSpans(
    overrides.filter((o) => o.staff_id === null && o.date === date),
  );
  if (override) return override;
  const weekday = weekdayOf(date);
  return mergeSpans(
    hours
      .filter((h) => h.weekday === weekday)
      .map((h) => ({
        startMin: timeToMinutes(h.opens_at),
        endMin: timeToMinutes(h.closes_at),
      })),
  );
}

/**
 * When one staff member works on a date (docs/booking-core.md): a staff
 * override decides, else their weekly rules, else (no rules at all) the
 * business windows. Always clipped to the business windows.
 */
export function staffWindows(opts: {
  date: ISODate;
  staffId: string;
  hours: HoursRow[];
  rules: RuleRow[];
  overrides: OverrideRow[];
}): MinuteSpan[] {
  const { date, staffId, hours, rules, overrides } = opts;
  const business = businessWindows(date, hours, overrides);
  const own = overrideSpans(
    overrides.filter((o) => o.staff_id === staffId && o.date === date),
  );
  if (own) return intersectSpans(own, business);
  const mine = rules.filter((r) => r.staff_id === staffId);
  if (mine.length === 0) return business;
  const weekday = weekdayOf(date);
  const today = mine
    .filter((r) => r.weekday === weekday)
    .map((r) => ({
      startMin: timeToMinutes(r.start_time),
      endMin: timeToMinutes(r.end_time),
    }));
  return intersectSpans(today, business);
}

// ---------- the day grid ----------

/** Whole-hour window covering every span shown. */
export function timelineWindow(spans: MinuteSpan[]): MinuteSpan {
  if (spans.length === 0) return DEFAULT_DAY;
  const start = Math.min(...spans.map((s) => s.startMin));
  const end = Math.max(...spans.map((s) => s.endMin));
  return {
    startMin: Math.floor(start / 60) * 60,
    endMin: Math.min(
      24 * 60,
      Math.max(Math.ceil(end / 60) * 60, Math.floor(start / 60) * 60 + 60),
    ),
  };
}
