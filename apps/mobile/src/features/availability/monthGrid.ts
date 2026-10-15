import type { MonthCell } from '@booking/ui';

import {
  MONTHS,
  WEEKDAYS,
  addDays,
  daysInMonth,
  parseISODate,
  toISODate,
  weekdayOf,
  type ISODate,
} from '@/lib/time';

export interface Month {
  year: number;
  /** 1-12 */
  month: number;
}

export const monthOf = (date: ISODate): Month => {
  const { y, m } = parseISODate(date);
  return { year: y, month: m };
};

export function shiftMonth(m: Month, delta: 1 | -1): Month {
  const index = m.year * 12 + (m.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export interface MonthView {
  title: string;
  weeks: (MonthCell | null)[][];
  /** False when the previous month ends before `min`. */
  canGoPrevious: boolean;
}

/** The month as rows of seven (Monday first), days before `min` switched off. */
export function buildMonthView(opts: {
  month: Month;
  selected: ISODate;
  today: ISODate;
  min?: ISODate;
}): MonthView {
  const { month, selected, today, min } = opts;
  const first = toISODate(month.year, month.month, 1);
  const lead = (weekdayOf(first) + 6) % 7; // blank cells before the 1st
  const count = daysInMonth(month.year, month.month);
  const cells: (MonthCell | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 0; day < count; day += 1) {
    const date = addDays(first, day);
    cells.push({
      value: date,
      label: String(day + 1),
      accessibilityLabel: `${WEEKDAYS[weekdayOf(date)]} ${day + 1} ${MONTHS[month.month - 1]}`,
      selected: date === selected,
      today: date === today,
      disabled: min !== undefined && date < min,
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );
  const previous = shiftMonth(month, -1);
  const previousLast = toISODate(
    previous.year,
    previous.month,
    daysInMonth(previous.year, previous.month),
  );
  return {
    title: `${MONTHS[month.month - 1]} ${month.year}`,
    weeks,
    canGoPrevious: min === undefined || previousLast >= min,
  };
}
