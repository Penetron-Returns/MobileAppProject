import type { TFunction } from 'i18next';

import { minutesToParts } from './rules';

/** "1 hour", "30 minutes", "2 days" for a number of minutes. */
export function formatMinutes(t: TFunction, minutes: number): string {
  const p = minutesToParts(minutes);
  return t(`settings.units.${p.unit}`, { count: p.count });
}

/** "3 days" for a number of days. */
export function formatDays(t: TFunction, days: number): string {
  return t('settings.units.days', { count: days });
}

/** "1 day and 2 hours", or "No reminders", for client reminder offsets. */
export function formatReminders(t: TFunction, offsets: number[]): string {
  if (offsets.length === 0) return t('settings.rules.noReminders');
  return offsets
    .map((m) => formatMinutes(t, m))
    .join(` ${t('settings.rules.and')} `);
}
