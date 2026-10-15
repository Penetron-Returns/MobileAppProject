import {
  businessDate,
  formatTime,
  WEEKDAYS_SHORT,
  weekdayOf,
} from '@/lib/time';

import type { ClovieVoiceHandsFree, ClovieVoiceStatus } from './clovieVoice';

/** Statuses where the service is running (or about to). */
export function isVoiceOn(status: ClovieVoiceStatus): boolean {
  return (
    status === 'starting' ||
    status === 'listening' ||
    status === 'standby' ||
    status === 'busy'
  );
}

/** The toggle can be turned on unless the build has no wake-word models. */
export function canTurnOnVoice(status: ClovieVoiceStatus): boolean {
  return status !== 'not_configured';
}

/** "08:00" today, "Mon 08:00" on another day, in the business timezone. */
export function formatDutyTime(
  instant: number,
  now: number,
  timezone: string,
): string {
  const time = formatTime(instant, timezone);
  const date = businessDate(instant, timezone);
  if (date === businessDate(now, timezone)) return time;
  return `${WEEKDAYS_SHORT[weekdayOf(date)]} ${time}`;
}

export interface HandsFreeLine {
  /** i18n key under `voice.hf.status`. */
  key:
    | 'off'
    | 'onDuty'
    | 'onDutyUntil'
    | 'offUntil'
    | 'offNoOpening'
    | 'waitingCharger'
    | 'pausedUntil'
    | 'pausedNoTime';
  /** Value for the `{{time}}` placeholder. */
  time?: string;
}

/** What the hands-free row says: "On duty until 18:00", "Off until opening at 08:00", ... */
export function handsFreeLine(
  hf: ClovieVoiceHandsFree,
  now: number,
  timezone: string,
): HandsFreeLine {
  if (!hf.enabled) return { key: 'off' };
  const time = (ms: number) => formatDutyTime(ms, now, timezone);
  switch (hf.duty) {
    case 'on_duty':
      return hf.untilMs
        ? { key: 'onDutyUntil', time: time(hf.untilMs) }
        : { key: 'onDuty' };
    case 'off_hours':
      return hf.untilMs
        ? { key: 'offUntil', time: time(hf.untilMs) }
        : { key: 'offNoOpening' };
    case 'waiting_charger':
      return { key: 'waitingCharger' };
    case 'paused':
      return hf.untilMs
        ? { key: 'pausedUntil', time: time(hf.untilMs) }
        : { key: 'pausedNoTime' };
    default:
      return { key: 'off' };
  }
}
