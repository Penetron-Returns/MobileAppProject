/**
 * South African public holidays. Pure.
 *
 * Public Holidays Act 36 of 1994: section 1 and Schedule 1 list the holidays (the fixed dates below, plus
 * Good Friday and Family Day, which is Easter Monday); section 2(1) says that when a public holiday falls
 * on a Sunday, the Monday following it is a public holiday. When that Monday is itself a holiday (Christmas
 * Day on a Sunday meets the Day of Goodwill on Monday) the observed day moves on to the next free day, which
 * is how government has proclaimed it (2022: Tuesday 27 December). One-off proclaimed days (elections,
 * national days of mourning) are not included: owners add those by hand.
 */
import type { ISODate } from '@booking/types';
import { addDays, weekdayOf } from '../../lib/time.ts';

export interface PublicHoliday {
  date: ISODate;
  name: string;
  /** The Sunday this Monday stands in for, else null */
  observed_for: ISODate | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (year: number, month: number, day: number): ISODate => `${year}-${pad(month)}-${pad(day)}`;

/** Gregorian Easter Sunday (Meeus/Jones/Butcher algorithm). */
export function easterSunday(year: number): ISODate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDate(year, month, day);
}

const FIXED: { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: "New Year's Day" },
  { month: 3, day: 21, name: 'Human Rights Day' },
  { month: 4, day: 27, name: 'Freedom Day' },
  { month: 5, day: 1, name: "Workers' Day" },
  { month: 6, day: 16, name: 'Youth Day' },
  { month: 8, day: 9, name: "National Women's Day" },
  { month: 9, day: 24, name: 'Heritage Day' },
  { month: 12, day: 16, name: 'Day of Reconciliation' },
  { month: 12, day: 25, name: 'Christmas Day' },
  { month: 12, day: 26, name: 'Day of Goodwill' },
];

/** The year's public holidays with Sunday holidays moved to the Monday, sorted by date. */
export function southAfricanPublicHolidays(year: number): PublicHoliday[] {
  const easter = easterSunday(year);
  const base = [
    ...FIXED.map((h) => ({ date: isoDate(year, h.month, h.day), name: h.name })),
    { date: addDays(easter, -2), name: 'Good Friday' },
    { date: addDays(easter, 1), name: 'Family Day' },
  ];
  // Holidays that stay on their own date; observed Mondays must not land on one of these.
  const taken = new Set(base.filter((h) => weekdayOf(h.date) !== 0).map((h) => h.date));
  const out: PublicHoliday[] = [];
  for (const h of base.sort((x, y) => x.date.localeCompare(y.date))) {
    if (weekdayOf(h.date) !== 0) {
      out.push({ ...h, observed_for: null });
      continue;
    }
    let observed = addDays(h.date, 1);
    while (taken.has(observed)) observed = addDays(observed, 1);
    taken.add(observed);
    out.push({ date: observed, name: `${h.name} (observed)`, observed_for: h.date });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}
