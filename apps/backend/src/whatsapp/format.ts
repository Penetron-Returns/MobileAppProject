import { DateTime } from 'luxon';

/** Display helpers. Everything is rendered in the business timezone. */

export function todayIn(tz: string, now: Date): string {
  return DateTime.fromJSDate(now, { zone: tz }).toISODate()!;
}

export function addDays(date: string, days: number, tz: string): string {
  return DateTime.fromISO(date, { zone: tz }).plus({ days }).toISODate()!;
}

// Fixed English names: ICU month abbreviations differ between Node builds ("Sep" vs "Sept").
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function dayLabel(dt: DateTime): string {
  return `${WEEKDAYS[dt.weekday - 1]} ${dt.day} ${MONTHS[dt.month - 1]}`;
}

/** "Tue 30 Sep" */
export function shortDate(date: string, tz: string): string {
  return dayLabel(DateTime.fromISO(date, { zone: tz }));
}

/** "Tue 30 Sep 2026" */
export function longDate(instant: string, tz: string): string {
  const dt = DateTime.fromISO(instant, { zone: tz });
  return `${dayLabel(dt)} ${dt.year}`;
}

/** "09:00" */
export function timeOf(instant: string, tz: string): string {
  return DateTime.fromISO(instant, { zone: tz }).toFormat('HH:mm');
}

/** Calendar date of an instant in the business timezone. */
export function dateOf(instant: string, tz: string): string {
  return DateTime.fromISO(instant, { zone: tz }).toISODate()!;
}

const CURRENCY_SYMBOLS: Record<string, string> = { ZAR: 'R', USD: '$', EUR: '€', GBP: '£' };

/** "R250.00" / "KES 250.00": fixed format, independent of the runtime's ICU data. */
export function money(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2);
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()];
  return symbol ? `${symbol}${amount}` : `${currency.toUpperCase()} ${amount}`;
}

/** "24 hours", "90 minutes" */
export function durationWords(minutes: number): string {
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return `${h} hour${h === 1 ? '' : 's'}`;
  }
  return `${minutes} minutes`;
}

export interface SummaryParts {
  service: string;
  startsAt: string;
  staff: string | null;
  price?: string | null;
}

export function summaryLines(p: SummaryParts, tz: string): string {
  const lines = [
    `Service: ${p.service}`,
    `Date: ${longDate(p.startsAt, tz)}`,
    `Time: ${timeOf(p.startsAt, tz)}`,
  ];
  if (p.staff) lines.push(`With: ${p.staff}`);
  if (p.price) lines.push(`Price: ${p.price}`);
  return lines.join('\n');
}
