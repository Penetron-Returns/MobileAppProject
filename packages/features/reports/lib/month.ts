import type { ISODate, MonthKey } from '@booking/types';
import { dateInZone } from '../../lib/time.ts';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isMonthKey = (value: string): boolean => MONTH_RE.test(value);

/** The calendar month containing `now` in the business timezone. */
export function currentMonth(now: Date, timeZone: string): MonthKey {
  return dateInZone(now, timeZone).slice(0, 7);
}

/** First day of the month, `YYYY-MM-01`. */
export const monthStart = (month: MonthKey): ISODate => `${month}-01`;
