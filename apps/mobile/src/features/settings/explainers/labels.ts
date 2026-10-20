import type { TFunction } from 'i18next';

/** Short labels for the thumbnails ("1 h", "30 min", "60 days", "30 s"). */
export function shortMinutes(t: TFunction, minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    return t('settings.explainers.hoursShort', { n: minutes / 60 });
  }
  return t('settings.explainers.minutesShort', { n: minutes });
}

export function shortDays(t: TFunction, days: number): string {
  return t('settings.explainers.daysShort', { count: days });
}

export function shortSeconds(t: TFunction, seconds: number): string {
  return seconds >= 60 && seconds % 60 === 0
    ? t('settings.explainers.minutesShort', { n: seconds / 60 })
    : t('settings.explainers.secondsShort', { n: seconds });
}

/** The nearest reminder for the thumbnail chip: "1 day" or "2 h" (the row itself lists them all). */
export function shortReminder(
  t: TFunction,
  offsets: number[],
): string | undefined {
  const first = offsets[0];
  if (first === undefined) return undefined;
  return first >= 1440 && first % 1440 === 0
    ? shortDays(t, first / 1440)
    : shortMinutes(t, first);
}
