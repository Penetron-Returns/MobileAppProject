import { zonedParts } from '@/lib/zoned';

export type GreetingPeriod = 'morning' | 'afternoon' | 'evening' | 'lateNight';

/**
 * Which greeting fits the business-local hour: 05:00-11:59 morning, 12:00-17:59
 * afternoon, 18:00-21:59 evening, 22:00-04:59 late night. `now` and the
 * timezone are injected so tests never read the clock.
 */
export function greetingPeriod(now: Date, timezone: string): GreetingPeriod {
  const { hour } = zonedParts(now, timezone);
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'lateNight';
}

/** The i18n key and values for the header greeting; no name drops the ", name". */
export function greetingText(
  now: Date,
  timezone: string,
  firstName: string | null | undefined,
): { key: string; values: { name: string } } {
  const name = firstName?.trim() ?? '';
  const period = greetingPeriod(now, timezone);
  return {
    key: `clovieTab.greeting.${period}${name ? '' : 'NoName'}`,
    values: { name },
  };
}
