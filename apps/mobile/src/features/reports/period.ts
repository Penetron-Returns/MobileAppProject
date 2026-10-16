import {
  addDays,
  diffDays,
  formatWeekdayDayMonth,
  MONTHS,
  parseISODate,
  toISODate,
  weekdayOf,
  zonedTimeToUtc,
  type ISODate,
} from '@/lib/time';

export type ReportRange = 'week' | 'month' | 'year';
export const REPORT_RANGES: readonly ReportRange[] = ['week', 'month', 'year'];

export interface ReportPeriod {
  range: ReportRange;
  /** First business-timezone day of the period. */
  from: ISODate;
  /** Exclusive end: the day after `today`. Nothing after today is counted. */
  to: ISODate;
  /** The same elapsed span one period earlier (for the "vs" delta). */
  prevFrom: ISODate;
  prevTo: ISODate;
  /** `day` bars for week and month, `month` bars for year. */
  granularity: 'day' | 'month';
  /** Chart bucket keys: every day of the week, days so far, months so far. */
  buckets: ISODate[];
}

const monthStart = (y: number, m: number): ISODate => toISODate(y, m, 1);

/** The first day of the period that contains `today`. */
function periodStart(range: ReportRange, today: ISODate): ISODate {
  const { y, m } = parseISODate(today);
  if (range === 'week') return addDays(today, -((weekdayOf(today) + 6) % 7));
  if (range === 'month') return monthStart(y, m);
  return monthStart(y, 1);
}

/** The first day of the period before the one starting at `from`. */
function previousStart(range: ReportRange, from: ISODate): ISODate {
  const { y, m } = parseISODate(from);
  if (range === 'week') return addDays(from, -7);
  if (range === 'month')
    return m === 1 ? monthStart(y - 1, 12) : monthStart(y, m - 1);
  return monthStart(y - 1, 1);
}

function bucketsFor(range: ReportRange, from: ISODate, today: ISODate) {
  if (range === 'week')
    return Array.from({ length: 7 }, (_, i) => addDays(from, i));
  if (range === 'month') {
    return Array.from({ length: diffDays(today, from) + 1 }, (_, i) =>
      addDays(from, i),
    );
  }
  const { y, m } = parseISODate(today);
  return Array.from({ length: m }, (_, i) => monthStart(y, i + 1));
}

/** Pure: the periods and chart buckets for a range, from the business "today". */
export function reportPeriod(range: ReportRange, today: ISODate): ReportPeriod {
  const from = periodStart(range, today);
  const to = addDays(today, 1);
  const prevFrom = previousStart(range, from);
  // Compare like with like: only as many days as have passed in this period.
  const prevTo = addDays(
    prevFrom,
    Math.min(diffDays(to, from), diffDays(from, prevFrom)),
  );
  return {
    range,
    from,
    to,
    prevFrom,
    prevTo,
    granularity: range === 'year' ? 'month' : 'day',
    buckets: bucketsFor(range, from, today),
  };
}

/** The bucket a business-timezone day falls in. */
export function bucketKey(
  date: ISODate,
  granularity: ReportPeriod['granularity'],
): ISODate {
  return granularity === 'day' ? date : `${date.slice(0, 7)}-01`;
}

/** UTC instants bounding both the period and the one before it (one query). */
export function periodQueryBounds(period: ReportPeriod, timezone: string) {
  return {
    from: zonedTimeToUtc(period.prevFrom, '00:00', timezone).toISOString(),
    to: zonedTimeToUtc(period.to, '00:00', timezone).toISOString(),
  };
}

/** What the delta compares against: "last week so far", "September", "2025". */
export function previousLabelParts(period: ReportPeriod): {
  kind: 'week' | 'month' | 'year';
  label: string;
} {
  const { y, m } = parseISODate(period.prevFrom);
  if (period.range === 'week') return { kind: 'week', label: '' };
  if (period.range === 'month') return { kind: 'month', label: MONTHS[m - 1] };
  return { kind: 'year', label: String(y) };
}

/**
 * The words under "Revenue ·": `from` is null when the period is a single day
 * or month so far ("14 October"), otherwise "1 to 14 October" (`from` = "1").
 */
export function periodLabelParts(
  period: ReportPeriod,
  today: ISODate,
): { from: string | null; to: string } {
  const a = parseISODate(period.from);
  const b = parseISODate(today);
  if (period.range === 'year') {
    const to = MONTHS[b.m - 1];
    return { from: b.m === 1 ? null : MONTHS[0], to };
  }
  if (period.from === today)
    return { from: null, to: `${b.d} ${MONTHS[b.m - 1]}` };
  return {
    from: a.m === b.m ? String(a.d) : `${a.d} ${MONTHS[a.m - 1]}`,
    to: `${b.d} ${MONTHS[b.m - 1]}`,
  };
}

/** Short bar label under the chart: `M`, `14`, `J`; blank when it would crowd. */
export function bucketLabel(key: ISODate, range: ReportRange): string {
  const { m, d } = parseISODate(key);
  if (range === 'week') return 'MTWTFSS'[(weekdayOf(key) + 6) % 7];
  if (range === 'year') return MONTHS[m - 1][0];
  return d === 1 || d % 5 === 0 ? String(d) : '';
}

/** Full name of a bar for the callout and screen readers: `Wed 14 Oct`, or `October`. */
export function bucketTitle(key: ISODate, range: ReportRange): string {
  return range === 'year'
    ? MONTHS[parseISODate(key).m - 1]
    : formatWeekdayDayMonth(key);
}
