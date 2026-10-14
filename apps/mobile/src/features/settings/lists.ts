import { formatMoney } from '@/lib/format';

/** Pure helpers behind the Services and Staff list screens. */

/** Groups by trimmed category, keeping first-seen order; blank ones go under `other`. */
export function groupByCategory<T extends { category: string | null }>(
  items: T[],
  other: string,
): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.category?.trim() || other;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()];
}

/** Distinct non-blank categories, for the "existing categories" hint. */
export function existingCategories(items: { category: string | null }[]) {
  return [
    ...new Set(
      items.map((i) => i.category?.trim()).filter((c): c is string => !!c),
    ),
  ];
}

/** Joins the parts that exist with a middle dot ("45 min · R350"). */
export function joinMeta(...parts: (string | null | false | undefined)[]) {
  return parts.filter((p): p is string => !!p).join(' · ');
}

export type StaffStatus = 'active' | 'paused' | 'inactive';

/** Inactive wins over "not taking bookings"; both are exceptions worth showing. */
export function staffStatus(member: {
  is_active: boolean;
  accepts_bookings: boolean;
}): StaffStatus {
  if (!member.is_active) return 'inactive';
  return member.accepts_bookings ? 'active' : 'paused';
}

/** The board's compact price: `R350` (no space, no cents when whole). */
export function compactMoney(cents: number, currency: string) {
  return formatMoney(cents, currency, { decimals: cents % 100 !== 0 }).replace(
    /^(\D+?)\s(?=\d)/,
    '$1',
  );
}

type Translate = (key: string, values?: Record<string, unknown>) => string;

/** Minutes as the board writes them: `45 min`, `1 h`, `1 h 15 min`. */
export function durationLabel(minutes: number, t: Translate) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return t('services.minutes', { value: rest });
  return rest
    ? t('services.hoursAndMinutes', { hours, minutes: rest })
    : t('services.hoursOnly', { hours });
}

/** First name for a chip ("Thandi Mokoena" -> "Thandi"). */
export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

export const SERVICE_DURATION_STEP = 15;
export const SERVICE_DURATION_MIN = 15;
export const SERVICE_DURATION_MAX = 720;

/** One stepper press: moves by `step` and stays inside `min`..`max`. */
export function stepValue(
  value: number,
  direction: 1 | -1,
  step: number,
  min: number,
  max: number,
) {
  return Math.min(max, Math.max(min, value + direction * step));
}
