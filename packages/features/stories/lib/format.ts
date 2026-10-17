/** Pure formatting and calendar helpers for the aggregators. Money stays in integer cents until display. */
import { DateTime } from 'luxon';

import { FALLBACK_CLIENT_NAME } from '../strings.ts';

const SYMBOLS: Record<string, string> = { ZAR: 'R', USD: '$', EUR: '€', GBP: '£' };

/** Integer cents -> "R2,450" (whole amounts) or "R2,450.50". Unknown currencies lead with the ISO code. */
export function formatMoney(cents: number, currency: string): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const rands = Math.floor(abs / 100);
  const rest = abs % 100;
  const whole = String(rands).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const symbol = SYMBOLS[currency] ?? `${currency} `;
  return `${negative ? '-' : ''}${symbol}${whole}${rest === 0 ? '' : `.${String(rest).padStart(2, '0')}`}`;
}

export function firstName(name: string | null): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : FALLBACK_CLIENT_NAME;
}

export function initialsOf(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.length === 0 ? '?' : parts.map((p) => p.charAt(0).toUpperCase()).join('');
}

const at = (iso: string, zone: string) => DateTime.fromISO(iso, { zone: 'utc' }).setZone(zone);

/** "09:00" in the business timezone. */
export const timeOf = (iso: string, zone: string): string => at(iso, zone).toFormat('HH:mm');
/** Minutes after local midnight. */
export const minutesOfDay = (iso: string, zone: string): number => {
  const d = at(iso, zone);
  return d.hour * 60 + d.minute;
};
/** Local calendar date, "2026-10-17". */
export const localDate = (iso: string, zone: string): string => at(iso, zone).toISODate()!;
/** "17 Sep". */
export const shortDate = (iso: string, zone: string): string => at(iso, zone).toFormat('d LLL');
/** "Tue 13 Oct". */
export const dayLabel = (iso: string, zone: string): string => at(iso, zone).toFormat('ccc d LLL');

export const hhmm = (minutes: number): string =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export const WEEK_MS = 7 * 24 * 3_600_000;
export const DAY_MS = 24 * 3_600_000;
