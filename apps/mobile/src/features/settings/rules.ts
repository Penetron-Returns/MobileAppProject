import type { BookingRules } from '@booking/types';

/** Defaults from docs/BUILD_PLAN.md §3, used when the stored JSON lacks a key. */
export const DEFAULT_RULES: BookingRules = {
  lead_time_minutes: 60,
  cancellation_window_minutes: 1440,
  buffer_minutes: 0,
  slot_interval_minutes: 15,
  booking_horizon_days: 60,
  reminder_offsets_minutes: [1440, 120],
  allow_staff_selection: true,
};

type NumericRule = Exclude<
  keyof BookingRules,
  'reminder_offsets_minutes' | 'allow_staff_selection'
>;

export const RULE_OPTIONS: Record<NumericRule, number[]> = {
  lead_time_minutes: [30, 60, 120, 240, 1440],
  booking_horizon_days: [14, 30, 60, 90, 180],
  cancellation_window_minutes: [120, 360, 720, 1440, 2880],
  slot_interval_minutes: [5, 10, 15, 30, 60],
  buffer_minutes: [0, 5, 10, 15, 30],
};

/** Reminder choices, as offsets before the booking (largest first). */
export const REMINDER_OPTIONS: number[][] = [[1440, 120], [1440], [120], []];

/** Reads the stored `booking_rules` JSON, filling any missing or invalid key with its default. */
export function parseRules(json: unknown): BookingRules {
  const src =
    json && typeof json === 'object' && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : {};
  const num = (key: NumericRule) =>
    typeof src[key] === 'number' && Number.isFinite(src[key])
      ? (src[key] as number)
      : DEFAULT_RULES[key];
  const offsets = Array.isArray(src.reminder_offsets_minutes)
    ? src.reminder_offsets_minutes.filter(
        (x): x is number => typeof x === 'number' && x > 0,
      )
    : DEFAULT_RULES.reminder_offsets_minutes;
  return {
    lead_time_minutes: num('lead_time_minutes'),
    cancellation_window_minutes: num('cancellation_window_minutes'),
    buffer_minutes: num('buffer_minutes'),
    slot_interval_minutes: num('slot_interval_minutes'),
    booking_horizon_days: num('booking_horizon_days'),
    reminder_offsets_minutes: [...offsets].sort((a, b) => b - a),
    allow_staff_selection:
      typeof src.allow_staff_selection === 'boolean'
        ? src.allow_staff_selection
        : DEFAULT_RULES.allow_staff_selection,
  };
}

export type DurationParts =
  | { unit: 'minutes'; count: number }
  | { unit: 'hours'; count: number }
  | { unit: 'days'; count: number };

/** Whole units only: 30 min, 2 hours, 1 day. Odd values stay in minutes. */
export function minutesToParts(minutes: number): DurationParts {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    return { unit: 'days', count: minutes / 1440 };
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    return { unit: 'hours', count: minutes / 60 };
  }
  return { unit: 'minutes', count: minutes };
}

/** True when `a` and `b` list the same offsets. */
export function sameOffsets(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
