import type {
  CompanionSetupDTO,
  WhatsAppHealthTemplateDTO,
} from '@booking/types';

import type { TFunction } from 'i18next';

type Whatsapp = CompanionSetupDTO['whatsapp'];
export type HealthTone = 'green' | 'amber' | 'red' | 'grey';

/** True when Nerova reported at least one health field, so the Health section has something to show. */
export function hasHealth(w: Whatsapp): boolean {
  return (
    isKnown(w.phone_number_status) ||
    isKnown(w.quality_rating) ||
    isKnown(w.messaging_limit_tier) ||
    !!w.verified_name ||
    isKnown(w.name_status) ||
    (w.templates?.length ?? 0) > 0 ||
    !!w.last_error ||
    !!w.last_health_check_at
  );
}

/** A value the app can name: present and not the `unknown` fallback. */
export const isKnown = (v: string | null | undefined): v is string =>
  !!v && v !== 'unknown';

const NUMBER_TONE: Record<string, HealthTone> = {
  connected: 'green',
  pending: 'amber',
  flagged: 'amber',
  restricted: 'red',
  disconnected: 'grey',
};
export const numberTone = (s: string): HealthTone => NUMBER_TONE[s] ?? 'grey';

const QUALITY_TONE: Record<string, HealthTone> = {
  green: 'green',
  yellow: 'amber',
  red: 'red',
};
export const qualityTone = (s: string): HealthTone => QUALITY_TONE[s] ?? 'grey';

const NAME_TONE: Record<string, HealthTone> = {
  approved: 'green',
  pending_review: 'amber',
  declined: 'red',
  expired: 'red',
  available_without_review: 'grey',
};
/** `none` and `unknown` have nothing to say. */
export const nameTone = (s: string): HealthTone | null => NAME_TONE[s] ?? null;

export const templateTone = (status: string): HealthTone =>
  status === 'approved'
    ? 'green'
    : status === 'pending'
      ? 'amber'
      : status === 'rejected'
        ? 'red'
        : 'grey';

/** "6 approved, 1 in review, 1 rejected": zero groups are left out. */
export function templateSummary(
  t: TFunction,
  templates: readonly WhatsAppHealthTemplateDTO[],
): string {
  const count = (...statuses: string[]) =>
    templates.filter((x) => statuses.includes(x.status)).length;
  const groups: [string, number][] = [
    ['approved', count('approved')],
    ['inReview', count('pending')],
    ['rejected', count('rejected')],
    ['paused', count('paused', 'disabled')],
  ];
  return groups
    .filter(([, n]) => n > 0)
    .map(([key, n]) =>
      t(`settings.whatsapp.health.templates.${key}`, { count: n }),
    )
    .join(', ');
}

/** "just now", "3 minutes ago", "2 hours ago", "4 days ago"; null for an unreadable instant. */
export function agoLabel(t: TFunction, iso: string, now: Date): string | null {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const minutes = Math.max(0, Math.floor((now.getTime() - then) / 60000));
  if (minutes < 1) return t('settings.whatsapp.health.ago.now');
  if (minutes < 60)
    return t('settings.whatsapp.health.ago.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return t('settings.whatsapp.health.ago.hours', { count: hours });
  return t('settings.whatsapp.health.ago.days', {
    count: Math.floor(hours / 24),
  });
}
