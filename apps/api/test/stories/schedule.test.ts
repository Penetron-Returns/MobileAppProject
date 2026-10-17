import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';

import { briefKey, businessPeriod, expiresAtFor, planStories, weekKey, type StoryHead } from '@booking/features/stories/lib/schedule.ts';
import { TZ, sastDate } from './fixtures.ts';

const OPEN_09 = 9 * 60;
const plan = (local: string, over: { firstOpenMinute?: number | null; existing?: StoryHead[]; timezone?: string } = {}) =>
  planStories({ now: sastDate(local), timezone: TZ, firstOpenMinute: OPEN_09, existing: [], ...over });
const kinds = (tasks: ReturnType<typeof plan>) => tasks.map((t) => `${t.kind}:${t.reason}`);
const head = (kind: StoryHead['kind'], periodKey: string, generatedLocal: string): StoryHead => ({ kind, periodKey, generatedAt: sastDate(generatedLocal).toISOString() });

describe('Brief timing (Saturday 2026-10-17, opening 09:00)', () => {
  it.each([
    ['08:29 is before the window', '2026-10-17T08:29', []],
    ['08:30 starts the window', '2026-10-17T08:30', ['brief:scheduled']],
    ['08:45 is inside it', '2026-10-17T08:45', ['brief:scheduled']],
    ['08:59 is its last minute', '2026-10-17T08:59', ['brief:scheduled']],
    ['09:00 is after opening: skipped', '2026-10-17T09:00', []],
    ['midday: skipped', '2026-10-17T12:00', []],
    ['the evening before: skipped', '2026-10-16T20:00', []],
  ])('%s', (_name, now, expected) => {
    expect(kinds(plan(now))).toEqual(expected);
  });

  it('skips a closed day', () => {
    expect(plan('2026-10-17T08:45', { firstOpenMinute: null })).toEqual([]);
  });

  it('follows the opening hour: 07:00 opening means 06:30-07:00', () => {
    expect(kinds(plan('2026-10-17T06:40', { firstOpenMinute: 420 }))).toEqual(['brief:scheduled']);
    expect(kinds(plan('2026-10-17T08:45', { firstOpenMinute: 420 }))).toEqual([]);
  });

  it('works in the business timezone: 06:45Z is 08:45 in Johannesburg but 07:45 in London', () => {
    const now = new Date('2026-10-17T06:45:00.000Z');
    expect(planStories({ now, timezone: TZ, firstOpenMinute: OPEN_09, existing: [] }).map((t) => t.kind)).toEqual(['brief']);
    expect(planStories({ now, timezone: 'Europe/London', firstOpenMinute: OPEN_09, existing: [] })).toEqual([]);
  });

  it('does not create a brief that already exists for today (idempotent), but a different day does not count', () => {
    expect(plan('2026-10-17T08:45', { existing: [head('brief', '2026-10-17', '2026-10-17T08:30')] })).toEqual([]);
    expect(kinds(plan('2026-10-17T08:45', { existing: [head('brief', '2026-10-16', '2026-10-16T08:30')] }))).toEqual(['brief:scheduled']);
  });

  it.each([
    ['14 minutes old is fresh', '2026-10-17T10:14', []],
    ['exactly 15 minutes is still fresh', '2026-10-17T10:15', []],
    ['16 minutes old is stale: refreshed, even after opening', '2026-10-17T10:16', ['brief:refresh']],
  ])('an existing brief %s', (_name, now, expected) => {
    expect(kinds(plan(now, { existing: [head('brief', '2026-10-17', '2026-10-17T10:00')] }))).toEqual(expected);
  });
});

describe('Client updates and Business update timing', () => {
  it('Monday 2026-10-19: Client updates and the weekly Business update are scheduled', () => {
    expect(kinds(plan('2026-10-19T00:15'))).toEqual(['clients:scheduled', 'business:scheduled']);
    expect(plan('2026-10-19T12:00').find((t) => t.kind === 'business')).toMatchObject({ periodKey: '2026-W43', span: 'week' });
  });

  it('a Tuesday schedules neither', () => {
    expect(plan('2026-10-20T12:00')).toEqual([]);
  });

  it('is Monday in the business zone: Sunday 22:30Z is Monday 00:30 SAST', () => {
    const now = new Date('2026-10-18T22:30:00.000Z');
    expect(planStories({ now, timezone: TZ, firstOpenMinute: null, existing: [] }).map((t) => t.kind)).toEqual(['clients', 'business']);
    expect(planStories({ now, timezone: 'America/New_York', firstOpenMinute: null, existing: [] })).toEqual([]);
  });

  it('the last day of the month schedules the month-end Business update only', () => {
    const tasks = plan('2026-10-31T12:00');
    expect(tasks).toEqual([{ kind: 'business', periodKey: '2026-10', span: 'month', reason: 'scheduled' }]);
  });

  it('month-end wins over Monday when they coincide (Monday 2026-08-31)', () => {
    const tasks = plan('2026-08-31T12:00');
    expect(tasks.filter((t) => t.kind === 'business')).toEqual([{ kind: 'business', periodKey: '2026-08', span: 'month', reason: 'scheduled' }]);
    expect(tasks.some((t) => t.kind === 'clients')).toBe(true);
  });

  it('never schedules what already exists, and refreshes Client updates (not Business) once stale', () => {
    const existing = [head('clients', '2026-W43', '2026-10-19T00:00'), head('business', '2026-W43', '2026-10-19T00:00')];
    expect(kinds(plan('2026-10-19T00:10', { existing }))).toEqual([]);
    expect(kinds(plan('2026-10-21T12:00', { existing }))).toEqual(['clients:refresh']);
  });

  it('does not refresh last week’s Client updates on a new week: Monday schedules a new one', () => {
    expect(kinds(plan('2026-10-26T00:15', { existing: [head('clients', '2026-W43', '2026-10-19T00:00')] }))).toEqual(['clients:scheduled', 'business:scheduled']);
  });
});

describe('period keys and expiry', () => {
  it.each([
    ['2026-10-17T12:00', '2026-W42'],
    ['2026-12-31T12:00', '2026-W53'],
    ['2027-01-01T12:00', '2026-W53'],
    ['2027-01-04T12:00', '2027-W01'],
  ])('%s is ISO week %s', (local, key) => {
    expect(weekKey(DateTime.fromISO(local, { zone: TZ }))).toBe(key);
  });

  it('businessPeriod: month-end on a leap-year February and none mid-week', () => {
    expect(businessPeriod(DateTime.fromISO('2028-02-29T10:00', { zone: TZ }))).toEqual({ periodKey: '2028-02', span: 'month' });
    expect(businessPeriod(DateTime.fromISO('2026-10-21T10:00', { zone: TZ }))).toBeNull();
    expect(briefKey(DateTime.fromISO('2026-10-17T23:59', { zone: TZ }))).toBe('2026-10-17');
  });

  it('a Brief expires at the end of the local day, the others after 8 days', () => {
    const now = sastDate('2026-10-17T08:30');
    expect(expiresAtFor('brief', now, TZ).toISOString()).toBe(sastDate('2026-10-18T00:00').toISOString());
    expect(expiresAtFor('clients', now, TZ).toISOString()).toBe(sastDate('2026-10-25T00:00').toISOString());
    expect(expiresAtFor('business', now, TZ).getTime()).toBeGreaterThan(now.getTime());
  });
});
