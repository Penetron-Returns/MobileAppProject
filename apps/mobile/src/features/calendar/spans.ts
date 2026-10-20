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

/** A per-staff day override (business-wide days are special days now). */
export interface OverrideRow {
  staff_id: string;
  date: string;
  is_closed: boolean;
  start_time: string | null;
  end_time: string | null;
}

/** A business-wide date that is closed or has its own single range. */
export interface SpecialDayRow {
  date: string;
  name: string;
  is_closed: boolean;
  start_time: string | null;
  end_time: string | null;
}

export interface BreakRow {
  staff_id: string;
  label: string;
  start_time: string;
  end_time: string;
  /** Empty = every day the person works. */
  weekdays: number[];
}

export interface TimeOffRow {
  staff_id: string;
  starts_on: string;
  ends_on: string;
  /** Both null = all day on every date of the range. */
  start_time: string | null;
  end_time: string | null;
  reason: 'leave' | 'sick' | 'training' | 'other';
  note: string | null;
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

/** The special day of a date, if there is one. */
export function specialDayOn(
  date: ISODate,
  specialDays: SpecialDayRow[],
): SpecialDayRow | null {
  return specialDays.find((d) => d.date === date) ?? null;
}

/** Business windows for a date: a special day decides, else the weekly hours. */
export function businessWindows(
  date: ISODate,
  hours: HoursRow[],
  specialDays: SpecialDayRow[],
): MinuteSpan[] {
  const special = specialDayOn(date, specialDays);
  if (special) {
    return special.is_closed || !special.start_time || !special.end_time
      ? []
      : mergeSpans([
          {
            startMin: timeToMinutes(special.start_time),
            endMin: timeToMinutes(special.end_time),
          },
        ]);
  }
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
 * business windows. Always clipped to the business windows (which a special
 * day replaces). Breaks and time off are separate blocks, see `staffBlocks`.
 */
export function staffWindows(opts: {
  date: ISODate;
  staffId: string;
  hours: HoursRow[];
  specialDays: SpecialDayRow[];
  rules: RuleRow[];
  overrides: OverrideRow[];
}): MinuteSpan[] {
  const { date, staffId, hours, specialDays, rules, overrides } = opts;
  const business = businessWindows(date, hours, specialDays);
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

export type BlockKind = 'break' | 'time_off';

/** A stretch of a working day that cannot be booked: a break or time off. */
export interface BlockedSpan extends MinuteSpan {
  kind: BlockKind;
  /** The break's name, or the time off's reason key (the view translates it). */
  label: string;
}

/**
 * The breaks and time off of one person on a date, clipped to when they work
 * (a break on a day off, or time off outside their hours, is not drawn).
 * Time off with no times covers the whole working day.
 */
export function staffBlocks(opts: {
  date: ISODate;
  staffId: string;
  working: MinuteSpan[];
  breaks: BreakRow[];
  timeOff: TimeOffRow[];
}): BlockedSpan[] {
  const { date, staffId, working, breaks, timeOff } = opts;
  const weekday = weekdayOf(date);
  const sources: { span: MinuteSpan; kind: BlockKind; label: string }[] = [
    ...breaks
      .filter(
        (b) =>
          b.staff_id === staffId &&
          (b.weekdays.length === 0 || b.weekdays.includes(weekday)),
      )
      .map((b) => ({
        kind: 'break' as const,
        label: b.label,
        span: {
          startMin: timeToMinutes(b.start_time),
          endMin: timeToMinutes(b.end_time),
        },
      })),
    ...timeOff
      .filter(
        (t) =>
          t.staff_id === staffId && t.starts_on <= date && date <= t.ends_on,
      )
      .map((t) => ({
        kind: 'time_off' as const,
        label: t.reason,
        span:
          t.start_time && t.end_time
            ? {
                startMin: timeToMinutes(t.start_time),
                endMin: timeToMinutes(t.end_time),
              }
            : { startMin: 0, endMin: 24 * 60 },
      })),
  ];
  const blocks = sources.flatMap(({ span, kind, label }) =>
    intersectSpans([span], working).map((s) => ({ ...s, kind, label })),
  );
  // A break inside time off adds nothing: drawn alone it would print over it.
  return blocks
    .filter(
      (b) =>
        b.kind !== 'break' ||
        !blocks.some(
          (o) =>
            o.kind === 'time_off' &&
            o.startMin <= b.startMin &&
            o.endMin >= b.endMin,
        ),
    )
    .sort((x, y) => x.startMin - y.startMin);
}
