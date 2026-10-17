/**
 * When each story is due (docs/stories.md). Pure: `now`, the timezone, the day's first opening time and the
 * stories that already exist are inputs; the cron job (every 15 minutes) just executes the plan.
 *
 *  - Brief: created in the BRIEF_LEAD_MINUTES before the first opening hour of the business's day; skipped
 *    otherwise (a closed day has no brief).
 *  - Client updates: created on Mondays.
 *  - Business update: created on Mondays (weekly) and on the last day of the month (month-end wins when both).
 *  - A Brief or Client updates story that already exists is refreshed once it is older than STALE_MS.
 *  - A story that already exists for its period is never created again (the unique key makes it idempotent anyway).
 */
import { DateTime } from 'luxon';

import type { StoryKind } from '../types.ts';
import type { BusinessSpan } from '../aggregators/business.ts';

export const BRIEF_LEAD_MINUTES = 30;
export const STALE_MS = 15 * 60_000;

export interface StoryHead {
  kind: StoryKind;
  periodKey: string;
  /** ISO-8601 UTC */
  generatedAt: string;
}

export interface StoryTask {
  kind: StoryKind;
  periodKey: string;
  /** Business update only */
  span?: BusinessSpan;
  reason: 'scheduled' | 'refresh';
}

export interface PlanInput {
  now: Date;
  timezone: string;
  /** Earliest opening time today in minutes after local midnight; null when the business is closed today */
  firstOpenMinute: number | null;
  existing: readonly StoryHead[];
}

export function briefKey(local: DateTime): string {
  return local.toISODate()!;
}
export function weekKey(local: DateTime): string {
  return local.toFormat("kkkk-'W'WW");
}
export function monthKey(local: DateTime): string {
  return local.toFormat('yyyy-LL');
}

/** The Business update due today, if any: the month-end one takes precedence over the weekly one. */
export function businessPeriod(local: DateTime): { periodKey: string; span: BusinessSpan } | null {
  if (local.day === local.daysInMonth) return { periodKey: monthKey(local), span: 'month' };
  if (local.weekday === 1) return { periodKey: weekKey(local), span: 'week' };
  return null;
}

export function planStories({ now, timezone, firstOpenMinute, existing }: PlanInput): StoryTask[] {
  const local = DateTime.fromMillis(now.getTime(), { zone: timezone });
  const have = (kind: StoryKind, periodKey: string) => existing.find((h) => h.kind === kind && h.periodKey === periodKey);
  const isStale = (h: StoryHead) => now.getTime() - Date.parse(h.generatedAt) > STALE_MS;
  const tasks: StoryTask[] = [];

  const brief = { kind: 'brief' as const, periodKey: briefKey(local) };
  const briefHead = have(brief.kind, brief.periodKey);
  const minuteOfDay = local.hour * 60 + local.minute;
  if (briefHead) {
    if (isStale(briefHead)) tasks.push({ ...brief, reason: 'refresh' });
  } else if (firstOpenMinute !== null && minuteOfDay >= firstOpenMinute - BRIEF_LEAD_MINUTES && minuteOfDay < firstOpenMinute) {
    tasks.push({ ...brief, reason: 'scheduled' });
  }

  const clients = { kind: 'clients' as const, periodKey: weekKey(local) };
  const clientsHead = have(clients.kind, clients.periodKey);
  if (clientsHead) {
    if (isStale(clientsHead)) tasks.push({ ...clients, reason: 'refresh' });
  } else if (local.weekday === 1) {
    tasks.push({ ...clients, reason: 'scheduled' });
  }

  const period = businessPeriod(local);
  if (period && !have('business', period.periodKey)) {
    tasks.push({ kind: 'business', periodKey: period.periodKey, span: period.span, reason: 'scheduled' });
  }
  return tasks;
}

/** Stories stop being served at the end of their local day (Brief) or after 8 days (the weekly and month-end ones). */
export function expiresAtFor(kind: StoryKind, now: Date, timezone: string): Date {
  const startOfDay = DateTime.fromMillis(now.getTime(), { zone: timezone }).startOf('day');
  return (kind === 'brief' ? startOfDay.plus({ days: 1 }) : startOfDay.plus({ days: 8 })).toJSDate();
}

/** Every story kind for the current periods, ignoring slots and existing rows (test/demo force mode). */
export function planForcedStories(now: Date, timezone: string): StoryTask[] {
  const local = DateTime.fromMillis(now.getTime(), { zone: timezone });
  return [
    { kind: 'brief', periodKey: briefKey(local), reason: 'scheduled' },
    { kind: 'clients', periodKey: weekKey(local), reason: 'scheduled' },
    { kind: 'business', periodKey: weekKey(local), span: 'week', reason: 'scheduled' },
  ];
}
